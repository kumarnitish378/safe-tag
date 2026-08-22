#!/usr/bin/env node
/**
 * SafeTag Instagram poster generator.
 *
 * Pipeline per day:
 *   1. Parse the day's brief from instagram-poster-prompts.md (single source of truth).
 *   2. Ask OpenAI gpt-image-1 for a TEXT-FREE background scene (so nothing garbles).
 *   3. Overlay the slogan (Hinglish + Hindi), logo and sftg.in with sharp — crisp,
 *      correctly-spelled type every time.
 *   4. Save marketing/out/day-NN.png + a captions.txt for bulk scheduling.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node marketing/generate.js            # all 30
 *   OPENAI_API_KEY=sk-... node marketing/generate.js --day 7    # just day 7
 *   node marketing/generate.js --dry-run                        # parse only, no API/cost
 *   node marketing/generate.js --day 1 --quality low            # cheaper test
 *
 * Needs: an OpenAI key on a verified org (gpt-image-1 requires org verification),
 * Node 20+ (global fetch), and sharp (already a project dependency).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MD = path.join(__dirname, 'instagram-poster-prompts.md');
const OUT = path.join(__dirname, 'out');
const DAILY = path.join(__dirname, 'daily'); // fixed output for automated posting
const W = 1024, H = 1536; // gpt-image-1 portrait ≈ 4:5

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] || true) : null; };
const DRY = argv.includes('--dry-run');
const TODAY = argv.includes('--today');
const QUALITY = (flag('--quality') || process.env.IMG_QUALITY || 'medium'); // low|medium|high|auto
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Rotate through the 30 posters by day-of-year so the cron picks one per day.
function todaysDay() {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const doy = Math.floor((today - start) / 86400000);
  return ((doy - 1) % 30) + 1;
}
const ONLY_DAY = flag('--day') ? parseInt(flag('--day'), 10) : (TODAY ? todaysDay() : null);

// ---------------------------------------------------------------------------
// 1. Parse the markdown brief
// ---------------------------------------------------------------------------
function parseDays(md) {
  const lines = md.split(/\r?\n/);
  const days = [];
  let cur = null;
  const pushHashtags = (raw) => {
    const m = raw.match(/`([^`]*#[^`]*)`/);
    return m ? m[1].trim() : '';
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^## Day (\d+) — (.+)$/))) {
      cur = { day: parseInt(m[1], 10), title: m[2].trim(), style: '', slogan: '', sloganHi: '', support: '', prompt: '', caption: '', hashtags: '' };
      days.push(cur);
    } else if (!cur) {
      continue;
    } else if ((m = line.match(/^- \*\*Style:\*\* (.+)$/))) {
      cur.style = m[1].trim();
    } else if ((m = line.match(/^- \*\*Slogan:\*\* \*\*(.+?)\*\* — \*(.+?)\*/))) {
      cur.slogan = m[1].trim();
      cur.sloganHi = m[2].trim();
    } else if ((m = line.match(/^- \*\*Support \(EN\):\*\* \*(.+?)\*/))) {
      cur.support = m[1].trim();
    } else if ((m = line.match(/^- \*\*Prompt:\*\* (.+)$/))) {
      cur.prompt = m[1].trim();
    } else if ((m = line.match(/^- \*\*Caption:\*\* (.+)$/))) {
      cur.caption = m[1].trim();
      // hashtags are on the following indented line
      if (lines[i + 1]) cur.hashtags = pushHashtags(lines[i + 1]);
    }
  }
  return days.filter(d => d.slogan && d.prompt);
}

// ---------------------------------------------------------------------------
// 2. Build a TEXT-FREE image prompt (we overlay the words ourselves)
// ---------------------------------------------------------------------------
function imagePrompt(d) {
  // Drop any "space for slogan / small logo / sftg.in" text-y bits from the scene
  // and hard-instruct: no text at all.
  const scene = d.prompt
    .replace(/Leave clean space[^.]*\./gi, '')
    .replace(/Space (?:at top |for )?[^.]*\./gi, '')
    .replace(/small SafeTag logo[^.]*\./gi, '')
    .replace(/[,.]?\s*`?sftg\.in`?[^.]*\.?/gi, '')
    .replace(/SafeTag logo[,.]?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return [
    scene,
    'ABSOLUTE RULE: render NO text, letters, words, numbers, captions, watermarks or logos anywhere in the image. Keep the lower third calmer / less busy with clean negative space where a title will be added later.',
    'Authentically Indian people and setting. Brand colours teal #0D9488 and deep navy #0A2342. Vertical 4:5 composition, high-resolution, professional advertising quality.',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// 3. Text overlay (SVG → composited by sharp)
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Greedy wrap into <=2 balanced lines for the big slogan.
function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function overlaySvg(d) {
  const sloganLines = wrap(d.slogan, 16);
  const fontSize = Math.min(110, Math.floor((W * 0.9) / (0.58 * Math.max(...sloganLines.map(l => l.length), 1))));
  const lineH = Math.round(fontSize * 1.12);
  const blockH = lineH * sloganLines.length;
  const hiSize = 40;
  const baseY = H - 210 - blockH; // slogan block sits above the bottom band
  const sloganTspans = sloganLines
    .map((l, idx) => `<text x="60" y="${baseY + lineH * (idx + 1)}" class="slogan">${esc(l)}</text>`)
    .join('');
  return Buffer.from(`
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A2342" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#0A2342" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#0A2342" stop-opacity="0.92"/>
    </linearGradient>
    <style>
      .slogan { font-family: 'Arial Black','Arial',sans-serif; font-weight: 900; fill: #ffffff; font-size: ${fontSize}px; letter-spacing: -0.5px; }
      .hi { font-family: 'Nirmala UI','Noto Sans Devanagari','Mangal',sans-serif; fill: #5eead4; font-size: ${hiSize}px; font-weight: 700; }
      .logo { font-family: 'Arial','sans-serif'; font-weight: 800; font-size: 34px; letter-spacing: 1px; }
      .url { font-family: 'Arial','sans-serif'; font-weight: 700; fill: #ffffff; font-size: 30px; }
    </style>
  </defs>

  <!-- bottom scrim for legibility -->
  <rect x="0" y="${Math.round(H * 0.45)}" width="${W}" height="${Math.round(H * 0.55)}" fill="url(#scrim)"/>

  <!-- logo pill top-left -->
  <rect x="48" y="48" rx="14" ry="14" width="196" height="58" fill="#0D9488"/>
  <text x="66" y="87" class="logo" fill="#ffffff">SafeTag</text>

  <!-- slogan -->
  ${sloganTspans}
  <!-- hindi line -->
  <text x="62" y="${baseY + blockH + 52}" class="hi">${esc(d.sloganHi)}</text>

  <!-- url bottom -->
  <text x="60" y="${H - 56}" class="url">sftg.in</text>
</svg>`);
}

async function compose(bgBuffer, d) {
  const svg = overlaySvg(d);
  return sharp(bgBuffer).resize(W, H, { fit: 'cover' }).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

// ---------------------------------------------------------------------------
// 4. OpenAI gpt-image-1
// ---------------------------------------------------------------------------
async function genBackground(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: `${W}x${H}`, quality: QUALITY, n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

// ---------------------------------------------------------------------------
async function main() {
  const days = parseDays(fs.readFileSync(MD, 'utf8'));
  console.log(`Parsed ${days.length} days from the brief.`);
  fs.mkdirSync(OUT, { recursive: true });

  if (TODAY) console.log(`--today → posting slot Day ${ONLY_DAY}.`);

  const captions = [];
  for (const d of days) {
    if (ONLY_DAY && d.day !== ONLY_DAY) continue;
    const captionFull = `${d.caption}\n${d.hashtags}`;
    captions.push(`=== Day ${d.day} — ${d.title} ===\n${captionFull}\n`);
    if (DRY) {
      console.log(`Day ${String(d.day).padStart(2, '0')}: "${d.slogan}"  |  ${d.sloganHi}`);
      continue;
    }
    if (!OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY (gpt-image-1 needs a verified OpenAI org).');
    process.stdout.write(`Day ${String(d.day).padStart(2, '0')} — generating… `);
    const bg = await genBackground(imagePrompt(d));
    const out = await compose(bg, d);
    const file = path.join(OUT, `day-${String(d.day).padStart(2, '0')}.png`);
    fs.writeFileSync(file, out);
    console.log('saved', path.relative(process.cwd(), file));

    // Fixed output the poster script reads (one poster per cron run).
    if (TODAY) {
      fs.mkdirSync(DAILY, { recursive: true });
      fs.writeFileSync(path.join(DAILY, 'poster.png'), out);
      fs.writeFileSync(path.join(DAILY, 'caption.txt'), captionFull);
      console.log('today →', path.relative(process.cwd(), path.join(DAILY, 'poster.png')));
    }
  }
  fs.writeFileSync(path.join(OUT, 'captions.txt'), captions.join('\n'));
  console.log(`\nDone. Images + captions.txt in: ${path.relative(process.cwd(), OUT)}`);
  if (DRY) console.log('(dry-run — no images generated, no API cost)');
}

if (require.main === module) {
  main().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
}

module.exports = { parseDays, imagePrompt, overlaySvg, compose, W, H, MD };

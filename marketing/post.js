#!/usr/bin/env node
/**
 * Publish one poster to Instagram via the official Graph API (Content Publishing).
 *
 * Flow:
 *   1. Host the local PNG at a public URL (uploads to imgbb if IMGBB_API_KEY is
 *      set; otherwise you pass a ready --image-url). Instagram requires a public
 *      image URL — it does NOT accept a binary upload for feed images.
 *   2. Create a media container (image_url + caption), wait until it's ready.
 *   3. Publish it.
 *
 * Usage:
 *   node marketing/post.js                       # posts marketing/daily/poster.png
 *   node marketing/post.js --image path.png       # a specific file
 *   node marketing/post.js --image-url https://…  # skip hosting, use this URL
 *   node marketing/post.js --dry-run              # show the plan, no network
 *
 * Required env (set as GitHub Actions secrets):
 *   IG_USER_ID        Instagram Business/Creator account id (a number)
 *   IG_ACCESS_TOKEN   long-lived / system-user token with instagram_content_publish
 *   IMGBB_API_KEY     free image host key (https://api.imgbb.com) — unless --image-url
 * Optional:
 *   GRAPH_VERSION     default v21.0
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] || true) : null; };
const DRY = argv.includes('--dry-run');

const IMAGE = flag('--image') || path.join(__dirname, 'daily', 'poster.png');
const CAPTION_FILE = flag('--caption-file') || path.join(__dirname, 'daily', 'caption.txt');
const IMAGE_URL_ARG = flag('--image-url');

const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const VER = process.env.GRAPH_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${VER}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${url.split('?')[0]} → ${res.status}: ${text}`);
  return json;
}

// 1. Host the image (imgbb) → public URL
async function hostImage(localPath) {
  if (IMAGE_URL_ARG) return IMAGE_URL_ARG;
  if (!IMGBB_API_KEY) throw new Error('No --image-url and no IMGBB_API_KEY to host the image.');
  const b64 = fs.readFileSync(localPath).toString('base64');
  const json = await postForm(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { image: b64 });
  if (!json.data || !json.data.url) throw new Error(`imgbb upload failed: ${JSON.stringify(json)}`);
  return json.data.url;
}

// 2 + 3. Create container → wait → publish
async function publishToInstagram(imageUrl, caption) {
  const container = await postForm(`${GRAPH}/${IG_USER_ID}/media`, {
    image_url: imageUrl, caption, access_token: IG_ACCESS_TOKEN,
  });
  const creationId = container.id;

  // Wait until the container is FINISHED (images are usually instant).
  for (let i = 0; i < 8; i++) {
    const status = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(IG_ACCESS_TOKEN)}`).then((r) => r.json());
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR') throw new Error(`Container error: ${JSON.stringify(status)}`);
    await sleep(3000);
  }

  const published = await postForm(`${GRAPH}/${IG_USER_ID}/media_publish`, {
    creation_id: creationId, access_token: IG_ACCESS_TOKEN,
  });
  return published.id;
}

async function main() {
  if (!fs.existsSync(IMAGE) && !IMAGE_URL_ARG) throw new Error(`Image not found: ${IMAGE} (run generate.js --today first).`);
  const caption = fs.existsSync(CAPTION_FILE) ? fs.readFileSync(CAPTION_FILE, 'utf8').trim() : (flag('--caption') || 'SafeTag — Scan Karo, Jaan Bachao. → sftg.in');

  console.log('Image   :', IMAGE_URL_ARG || IMAGE);
  console.log('Caption :', caption.split('\n')[0].slice(0, 80) + '…');

  if (DRY) {
    console.log('\n[dry-run] Would host the image, then create + publish an IG container.');
    console.log('[dry-run] Needs env: IG_USER_ID, IG_ACCESS_TOKEN, IMGBB_API_KEY. No network called.');
    return;
  }
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) throw new Error('Set IG_USER_ID and IG_ACCESS_TOKEN.');

  const imageUrl = await hostImage(IMAGE);
  console.log('Hosted  :', imageUrl);
  const mediaId = await publishToInstagram(imageUrl, caption);
  console.log('✅ Posted to Instagram. Media id:', mediaId);
}

main().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });

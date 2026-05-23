// scripts/generate-ppt.js
// Usage: node scripts/generate-ppt.js
// Output: SafeTag-Business-PPT.pptx

const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();
pptx.layout  = 'LAYOUT_WIDE'; // 13.33 × 7.5 inches
pptx.author  = 'SafeTag';
pptx.company = 'SafeTag India';
pptx.title   = 'SafeTag — Business Presentation';

// ── Palette ──────────────────────────────────────────────
const C = {
  navy:    '0A2342',
  navyD:   '091224',
  navyM:   '0f1f38',
  teal:    '0D9488',
  tealL:   '5eead4',
  tealXL:  'ccfbf1',
  orange:  'F97316',
  white:   'FFFFFF',
  light:   'F8FAFC',
  slate:   '64748B',
  slateL:  '94a3b8',
  slateD:  '334155',
  green:   '22C55E',
  red:     'EF4444',
  redD:    '7f1d1d',
  indigo:  '6366f1',
  row0:    'f0fdfa',
  row1:    'FFFFFF',
  border:  'e2e8f0',
};

const F = 'Calibri'; // widely-available Windows font

// ── Helpers ──────────────────────────────────────────────
const slide = {
  navy:  () => { const s = pptx.addSlide(); s.background = { color: C.navy };  return s; },
  light: () => { const s = pptx.addSlide(); s.background = { color: C.light }; return s; },
  white: () => { const s = pptx.addSlide(); s.background = { color: C.white }; return s; },
};

function bar(s, color = C.teal, h = 0.22) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h, fill: { color } });
}

function label(s, text) {
  s.addText(text.toUpperCase(), {
    x: 0.5, y: 0.06, w: 12, h: 0.22,
    fontSize: 9, bold: true, color: C.teal, charSpacing: 4, fontFace: F,
  });
}

function h1(s, text, y = 0.4, color = C.navy) {
  s.addText(text, { x: 0.5, y, w: 12.3, h: 0.7, fontSize: 26, bold: true, color, fontFace: F, wrap: true });
}

function sub(s, text, y = 1.15, color = C.slate) {
  s.addText(text, { x: 0.5, y, w: 12.3, h: 0.45, fontSize: 13, color, fontFace: F });
}

function statBox(s, value, lineLabel, x, y, bg = C.teal, w = 2.9) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h: 1.7, fill: { color: bg }, rectRadius: 0.08 });
  s.addText(value, {
    x, y: y + 0.18, w, h: 0.75,
    fontSize: 30, bold: true, color: C.white, align: 'center', fontFace: F,
  });
  s.addText(lineLabel, {
    x, y: y + 0.95, w, h: 0.55,
    fontSize: 11, color: C.white, align: 'center', fontFace: F, lineSpacingMultiple: 1.3,
  });
}

function pillar(s, x, title, color, items) {
  s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 4.0, h: 0.52, fill: { color }, rectRadius: 0.06 });
  s.addText(title, {
    x, y: 1.6, w: 4.0, h: 0.42,
    fontSize: 14, bold: true, color: C.white, align: 'center', fontFace: F,
  });
  s.addShape(pptx.ShapeType.rect, { x, y: 2.07, w: 4.0, h: 5.1, fill: { color: C.navyM }, line: { color, pt: 1 }, rectRadius: 0.06 });
  items.forEach((item, j) => {
    s.addText('• ' + item, {
      x: x + 0.2, y: 2.2 + j * 0.82, w: 3.65, h: 0.75,
      fontSize: 12, color: 'cbd5e1', fontFace: F, lineSpacingMultiple: 1.3,
    });
  });
}

function segCard(s, icon, label, desc, x, y) {
  s.addShape(pptx.ShapeType.rect, { x, y, w: 4.1, h: 1.85, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
  s.addText(icon, { x, y: y + 0.1, w: 1.1, h: 1.55, fontSize: 30, align: 'center', fontFace: F });
  s.addText(label, { x: x + 1.0, y: y + 0.1, w: 3.0, h: 0.42, fontSize: 13, bold: true, color: C.navy, fontFace: F });
  s.addText(desc,  { x: x + 1.0, y: y + 0.55, w: 3.0, h: 1.2,  fontSize: 11, color: C.slate, fontFace: F, lineSpacingMultiple: 1.3 });
}

function advCard(s, icon, title, desc, x, y) {
  s.addShape(pptx.ShapeType.rect, { x, y, w: 4.1, h: 1.85, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
  s.addText(icon,  { x, y: y + 0.1, w: 1.1, h: 1.55, fontSize: 28, align: 'center', fontFace: F });
  s.addText(title, { x: x + 1.0, y: y + 0.1, w: 3.0, h: 0.42, fontSize: 13, bold: true, color: C.navy, fontFace: F });
  s.addText(desc,  { x: x + 1.0, y: y + 0.55, w: 3.0, h: 1.2,  fontSize: 11, color: C.slate, fontFace: F, lineSpacingMultiple: 1.3 });
}

// ════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0,   w: '100%', h: 0.38, fill: { color: C.teal } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.12, w: '100%', h: 0.38, fill: { color: C.teal } });

  s.addText('🏷️  SafeTag', {
    x: 1, y: 1.2, w: 11, h: 1.3,
    fontSize: 62, bold: true, color: C.white, align: 'center', fontFace: F,
  });
  s.addText('Scan. Know. Save a Life.', {
    x: 1, y: 2.65, w: 11, h: 0.6,
    fontSize: 24, color: C.tealL, align: 'center', fontFace: F,
  });
  s.addShape(pptx.ShapeType.rect, { x: 4.65, y: 3.45, w: 4.0, h: 0.05, fill: { color: C.teal } });
  s.addText("India's QR + NFC Emergency Identity Tag Platform", {
    x: 1, y: 3.6, w: 11, h: 0.5,
    fontSize: 16, color: C.slateL, align: 'center', fontFace: F,
  });
  s.addText('B2C · B2B · Manufacturer Platform  ·  SDD v3.0', {
    x: 1, y: 5.8, w: 11, h: 0.4,
    fontSize: 11, color: '475569', align: 'center', fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 2 — THE PROBLEM
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  bar(s, C.red);
  label(s, 'The Problem');
  h1(s, '"14 hours.  No ID.  No way to reach her family."', 0.4, C.white);
  sub(s, 'A 6-year-old went missing at Kumbh Mela. With one small SafeTag, it would have ended in 7 minutes.', 1.2, C.tealL);

  statBox(s, '12,400+',  'Children missing\nevery month in India',  0.5,  2.4, C.red);
  statBox(s, '14 hrs',   'Avg. reunion time\nwithout identification', 3.7,  2.4, C.redD);
  statBox(s, 'Zero',     'Apps needed to\nscan a SafeTag',           6.9,  2.4, C.teal);
  statBox(s, '< 3 sec',  'Emergency profile\nopens in…',             10.1, 2.4, '0f766e');

  s.addText('The same crisis happens to elderly with dementia, accident victims, solo trekkers, and lost pets.\nSafeTag is built to end it — in under 3 seconds.', {
    x: 0.5, y: 4.5, w: 12.3, h: 0.7,
    fontSize: 13, color: C.slateL, fontFace: F, lineSpacingMultiple: 1.5,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 3 — THE SOLUTION
// ════════════════════════════════════════════════════════
{
  const s = slide.light();
  bar(s, C.teal);
  label(s, 'The Solution');
  h1(s, 'SafeTag — One Tag. Two Technologies. Zero Apps.');

  // QR column
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.35, w: 5.7, h: 4.9, fill: { color: C.white }, line: { color: C.border, pt: 1 }, rectRadius: 0.1 });
  s.addText('📷  QR Code', { x: 0.7, y: 1.55, w: 5.3, h: 0.5, fontSize: 20, bold: true, color: C.teal, fontFace: F });
  [
    ['Any phone camera — point and scan',           '✅'],
    ['Works on Android + iPhone + feature phones',   '✅'],
    ['Opens in under 3 seconds',                     '✅'],
    ['No login for the rescuer',                     '✅'],
    ['Printable on any surface',                     '✅'],
  ].forEach(([text, icon], i) => {
    s.addText(`${icon}  ${text}`, { x: 0.7, y: 2.2 + i * 0.72, w: 5.3, h: 0.6, fontSize: 13, color: C.navy, fontFace: F });
  });

  // VS divider
  s.addShape(pptx.ShapeType.ellipse, { x: 6.17, y: 3.55, w: 1.0, h: 0.9, fill: { color: C.teal } });
  s.addText('+', { x: 6.17, y: 3.6, w: 1.0, h: 0.8, fontSize: 28, bold: true, color: C.white, align: 'center', fontFace: F });

  // NFC column
  s.addShape(pptx.ShapeType.rect, { x: 7.1, y: 1.35, w: 5.7, h: 4.9, fill: { color: C.white }, line: { color: C.border, pt: 1 }, rectRadius: 0.1 });
  s.addText('📡  RFID / NFC Chip', { x: 7.3, y: 1.55, w: 5.3, h: 0.5, fontSize: 20, bold: true, color: C.navy, fontFace: F });
  [
    ['Tap phone near tag — no camera needed',        '✅'],
    ['Works in darkness or when QR is scratched',    '✅'],
    ['Water resistant — works in rain or floods',    '✅'],
    ['Works at any angle, through wallets & bags',   '✅'],
    ['iPhone 7+ and most Android phones',            '✅'],
  ].forEach(([text, icon], i) => {
    s.addText(`${icon}  ${text}`, { x: 7.3, y: 2.2 + i * 0.72, w: 5.3, h: 0.6, fontSize: 13, color: C.navy, fontFace: F });
  });

  // Bottom banner
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 6.5, w: 12.3, h: 0.65, fill: { color: C.teal }, rectRadius: 0.06 });
  s.addText('DUAL PROTECTION — Either technology alone is enough. Both together mean there is no failure mode.', {
    x: 0.7, y: 6.56, w: 12.0, h: 0.53,
    fontSize: 13, bold: true, color: C.white, fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 4 — HOW IT WORKS
// ════════════════════════════════════════════════════════
{
  const s = slide.white();
  bar(s, C.teal);
  label(s, 'How It Works');
  h1(s, '4 Steps. No App Required. Works for Anyone.');

  const steps = [
    { n: '1', title: 'Buy & Attach',     body: 'Order a keychain, sticker,\nwristband, or ID card.\nAttach to bag, lanyard,\nor ID badge.' },
    { n: '2', title: 'Set Up Profile',   body: 'Scan the QR, fill in name,\nblood group, emergency\ncontacts, allergies.\nTakes 2 minutes.' },
    { n: '3', title: 'Scan or Tap NFC',  body: 'Anyone scans the QR or\ntaps the NFC chip with\ntheir phone. No app.\nNo account for rescuer.' },
    { n: '4', title: 'Instant Reunion',  body: 'Profile opens in 3 sec.\nThey call directly.\nWhatsApp gets a\nlive location alert.' },
  ];

  steps.forEach((st, i) => {
    const x = 0.35 + i * 3.22;
    // Number circle
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.75, y: 1.45, w: 0.95, h: 0.95, fill: { color: C.teal } });
    s.addText(st.n, { x: x + 0.75, y: 1.5, w: 0.95, h: 0.85, fontSize: 22, bold: true, color: C.white, align: 'center', fontFace: F });
    // Card
    s.addShape(pptx.ShapeType.rect, { x, y: 2.55, w: 3.05, h: 3.2, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
    s.addText(st.title, { x, y: 2.7, w: 3.05, h: 0.48, fontSize: 14, bold: true, color: C.teal, align: 'center', fontFace: F });
    s.addText(st.body,  { x: x + 0.12, y: 3.25, w: 2.8, h: 2.2, fontSize: 12, color: C.navy, align: 'center', fontFace: F, lineSpacingMultiple: 1.5 });
    // Arrow
    if (i < 3) {
      s.addText('→', { x: x + 3.02, y: 3.0, w: 0.25, h: 0.5, fontSize: 22, color: C.teal, fontFace: F });
    }
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 5 — PRODUCT RANGE
// ════════════════════════════════════════════════════════
{
  const s = slide.light();
  bar(s, C.navy);
  label(s, 'Product Range');
  h1(s, 'Physical Tags — Every Lifestyle, Every Budget');

  const products = [
    { icon: '🔖', name: 'QR Sticker',   price: '₹149', from: 'from',   desc: 'Stick on helmet, wallet,\nbottle, school bag.\nWeather resistant.' },
    { icon: '🔑', name: 'Keychain',     price: '₹249', from: 'from',   desc: 'Attach to keys, bags,\nstroller, lanyard.\nDurable ABS plastic.' },
    { icon: '📿', name: 'Wristband',    price: '₹349', from: 'from',   desc: 'Silicone, waterproof.\nFor children, elderly,\nand athletes.' },
    { icon: '💳', name: 'RFID ID Card', price: '₹399', from: 'from',   desc: 'PVC card format.\nSchools, hospitals,\ncorporate ID badges.' },
  ];

  products.forEach((p, i) => {
    const x = 0.5 + i * 3.22;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 3.05, h: 5.0, fill: C.white, line: { color: C.border, pt: 1 }, rectRadius: 0.12 });
    s.addText(p.icon,  { x, y: 1.7,  w: 3.05, h: 1.05, fontSize: 44, align: 'center', fontFace: F });
    s.addText(p.name,  { x, y: 2.8,  w: 3.05, h: 0.45, fontSize: 15, bold: true, color: C.navy, align: 'center', fontFace: F });
    s.addText(p.price, { x, y: 3.3,  w: 3.05, h: 0.55, fontSize: 24, bold: true, color: C.teal, align: 'center', fontFace: F });
    s.addText(p.from,  { x, y: 3.82, w: 3.05, h: 0.3,  fontSize: 10, color: C.slate, align: 'center', fontFace: F });
    s.addText(p.desc,  { x: x + 0.15, y: 4.2, w: 2.75, h: 1.8, fontSize: 12, color: C.slate, align: 'center', fontFace: F, lineSpacingMultiple: 1.4 });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 6 — TARGET SEGMENTS
// ════════════════════════════════════════════════════════
{
  const s = slide.white();
  bar(s, C.teal);
  label(s, 'Target Market');
  h1(s, 'Who Needs an Emergency ID Tag?');
  sub(s, 'Anyone who could be separated from the people who love them — child, elder, traveler, or pet.');

  const segs = [
    { icon: '👧', label: 'Children',  desc: 'Lost at fairs, stations, temples.\n12,400+ children missing/month in India.' },
    { icon: '👴', label: 'Elderly',   desc: 'Dementia patients, seniors with no phone.\nStranger calls family in seconds.' },
    { icon: '🧳', label: 'Travelers', desc: 'Solo trips, Kumbh Mela, pilgrimages.\nNo language barrier — anyone can help.' },
    { icon: '🐕', label: 'Pets',      desc: 'Lost dogs and cats.\nFinder calls owner directly — no app.' },
    { icon: '🚴', label: 'Athletes',  desc: 'Cyclists, trekkers, marathon runners.\nFull medical info ready for paramedics.' },
    { icon: '🏫', label: 'Schools',   desc: 'Bulk ID badges for school trips.\nEvery student identified in seconds.' },
  ];

  segs.forEach((sg, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    segCard(s, sg.icon, sg.label, sg.desc, 0.4 + col * 4.35, 1.95 + row * 2.2);
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 7 — BUSINESS MODEL
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  bar(s, C.orange);
  label(s, 'Business Model');
  h1(s, 'Three Revenue Pillars — B2C + B2B + Manufacturer Platform', 0.4, C.white);

  pillar(s, 0.5, '🛒  B2C Direct Sales', C.teal, [
    'Consumer buys via online store',
    'Price: ₹149 – ₹499/unit',
    'Razorpay + Cash on Delivery',
    'Free shipping above ₹499',
    'QR + NFC activation included',
  ]);
  pillar(s, 4.65, '🏫  B2B Institutional', C.orange, [
    'Schools, hospitals, corporates',
    'Bulk: 50 – 10,000 units',
    'Volume pricing + SLA',
    'CSV batch + custom branding',
    'Recurring annual renewal',
  ]);
  pillar(s, 8.8, '🏭  Manufacturer Platform', C.indigo, [
    'Factories list products on store',
    'We provide tag IDs + QR + NFC CSV',
    'Revenue share per sale',
    'Activation analytics dashboard',
    'Zero inventory for SafeTag',
  ]);
}

// ════════════════════════════════════════════════════════
// SLIDE 8 — PRICING & UNIT ECONOMICS
// ════════════════════════════════════════════════════════
{
  const s = slide.light();
  bar(s, C.teal);
  label(s, 'Revenue & Pricing');
  h1(s, 'Unit Economics — Healthy Margins Across All Segments');

  const headers = ['Segment',             'Unit Price', 'Est. COGS', 'Gross Margin', 'Volume Potential'];
  const colW    = [2.9, 1.7, 1.55, 1.75, 2.5];
  const colX    = [0.3, 3.2, 4.9,  6.45, 8.2 ];
  const rows    = [
    ['QR Sticker (B2C)',    '₹149',    '₹35',  '76 %',         '50,000+ / yr'],
    ['Keychain (B2C)',      '₹249',    '₹65',  '74 %',         '30,000+ / yr'],
    ['Wristband (B2C)',     '₹349',    '₹90',  '74 %',         '20,000+ / yr'],
    ['School Bulk (B2B)',   '₹120 / u','₹35',  '71 %',         '1,00,000+ / yr'],
    ['Hospital Bulk (B2B)','₹150 / u','₹35',  '77 %',         '50,000+ / yr'],
    ['Manufacturer Fee',   '15% rev', '—',    'Pure SaaS',    'Scales with GMV'],
  ];

  // Header row
  headers.forEach((h, i) => {
    s.addShape(pptx.ShapeType.rect, { x: colX[i], y: 1.55, w: colW[i], h: 0.45, fill: { color: C.navy } });
    s.addText(h, { x: colX[i], y: 1.6, w: colW[i], h: 0.35, fontSize: 11, bold: true, color: C.white, align: 'center', fontFace: F });
  });

  // Data rows
  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? C.white : 'f0fdfa';
    row.forEach((cell, ci) => {
      s.addShape(pptx.ShapeType.rect, { x: colX[ci], y: 2.0 + ri * 0.56, w: colW[ci], h: 0.53, fill: { color: bg }, line: { color: C.border, pt: 0.5 } });
      s.addText(cell, {
        x: colX[ci] + 0.06, y: 2.07 + ri * 0.56, w: colW[ci] - 0.12, h: 0.39,
        fontSize: 11,
        color: ci === 3 ? C.teal : C.navy,
        bold: ci === 3,
        align: ci === 0 ? 'left' : 'center',
        fontFace: F,
      });
    });
  });

  s.addShape(pptx.ShapeType.rect, { x: 0.3, y: 5.5, w: 12.4, h: 0.65, fill: { color: C.navy }, rectRadius: 0.07 });
  s.addText('🎯  Target ARR — Year 1: ₹60 L   ·   Year 2: ₹2.5 Cr   ·   Year 3: ₹8 Cr+   ·   Break-even: Month 14–18', {
    x: 0.5, y: 5.56, w: 12.2, h: 0.53,
    fontSize: 13, bold: true, color: C.white, align: 'center', fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 9 — MARKET OPPORTUNITY
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  bar(s, C.teal);
  label(s, 'Market Opportunity');
  h1(s, "India's Emergency Safety Market — Largely Untapped", 0.4, C.white);

  statBox(s, '14 Cr+',  'Families with\nchildren under 15',   0.5,  1.55, C.teal);
  statBox(s, '4 Cr+',   'Dementia &\nelderly care families',  3.7,  1.55, '0f766e');
  statBox(s, '8 Cr+',   'Domestic travelers\nper month',      6.9,  1.55, '1e3a5f');
  statBox(s, '10 Cr+',  'Pet owners in\nurban India',         10.1, 1.55, '1e40af');

  // TAM / SAM / SOM bar
  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.55, w: 12.3, h: 0.7, fill: { color: C.navyM }, rectRadius: 0.07 });
  s.addText(
    '  TAM  ~₹12,000 Cr       SAM  ~₹1,800 Cr (digital-aware urban India)       SOM  ~₹250 Cr (Year 3 target)',
    { x: 0.7, y: 3.62, w: 12.0, h: 0.56, fontSize: 13, color: C.white, fontFace: F }
  );

  s.addText([
    { text: 'No established national competitor ', options: { color: C.white } },
    { text: 'in QR + NFC dual-tech emergency ID for India. ', options: { color: C.tealL, bold: true } },
    { text: 'Imported ICE tags lack Hindi support, NFC backup, and local distribution networks.', options: { color: C.slateL } },
  ], { x: 0.5, y: 4.5, w: 12.3, h: 0.8, fontSize: 13, fontFace: F, lineSpacingMultiple: 1.5 });

  s.addText([
    { text: '🏆  First-mover advantage in India\'s ₹12,000 Cr personal safety market.', options: { bold: true } },
  ], { x: 0.5, y: 5.5, w: 12.3, h: 0.5, fontSize: 14, color: C.tealL, fontFace: F });
}

// ════════════════════════════════════════════════════════
// SLIDE 10 — COMPETITIVE ADVANTAGES
// ════════════════════════════════════════════════════════
{
  const s = slide.white();
  bar(s, C.teal);
  label(s, 'Competitive Edge');
  h1(s, 'Why SafeTag Wins — 6 Structural Advantages');

  const adv = [
    { icon: '📡', title: 'Dual QR + NFC',        desc: 'No competitor offers both. NFC works when QR fails — the only truly no-failure emergency tag in India.' },
    { icon: '📵', title: 'Zero App Friction',     desc: 'Rescuer needs nothing installed. Camera or NFC tap. Maximum adoption — anyone can help.' },
    { icon: '🇮🇳', title: 'India-First Design',   desc: 'Hindi UI, Razorpay + COD, Indian address format, WhatsApp alerts, local manufacturer network.' },
    { icon: '🏭', title: 'Asset-Light Supply',    desc: 'Crowdsourced manufacturing. Any Indian factory can list and ship — we own the platform, not the inventory.' },
    { icon: '⚡', title: 'Instant Activation',    desc: 'Customer scans tag → fills profile → tag live in 2 minutes. No factory pre-programming delay.' },
    { icon: '🔒', title: 'Privacy by Design',     desc: 'Only accessible via physical tag scan — not searchable on the internet. No data sold. Ever.' },
  ];

  adv.forEach((a, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    advCard(s, a.icon, a.title, a.desc, 0.4 + col * 4.35, 1.65 + row * 2.2);
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 11 — GO-TO-MARKET
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  bar(s, C.orange);
  label(s, 'Go-to-Market');
  h1(s, 'Three-Channel Distribution Strategy', 0.4, C.white);

  pillar(s, 0.5,  '🛒  Online Direct', C.teal, [
    'safe-tag.in — SEO + Paid Ads',
    'Instagram, Facebook, YouTube',
    'Google Shopping for tags',
    'Parenting & travel influencers',
    'COD removes payment barrier',
  ]);
  pillar(s, 4.65, '🏫  Institutional B2B', C.orange, [
    'Schools: safety ID for trips',
    'Hospitals: patient wristbands',
    'Corporate ID badge add-on',
    'NGOs for child safety programs',
    'Govt ICDS Anganwadi (LT)',
  ]);
  pillar(s, 8.8, '🏭  Manufacturer Channel', C.indigo, [
    'Any Indian factory can list',
    'We provide IDs + QR + NFC CSV',
    'Factory makes & ships direct',
    'Revenue share — zero CapEx',
    '10,000-tag batches, instant CSV',
  ]);
}

// ════════════════════════════════════════════════════════
// SLIDE 12 — TRACTION
// ════════════════════════════════════════════════════════
{
  const s = slide.light();
  bar(s, C.green);
  label(s, 'Traction');
  h1(s, 'Platform Built. Community Growing. Reunions Happening.');

  statBox(s, '12,400+', 'Tags\nActivated',         0.5,  1.55, C.teal);
  statBox(s, '182',     'Verified\nReunions',       3.7,  1.55, C.green);
  statBox(s, '< 3 s',   'Emergency Page\nLoad Time', 6.9, 1.55, C.navy);
  statBox(s, '3+',      'Manufacturer\nPartners',   10.1, 1.55, C.indigo);

  s.addText('Verified customer stories:', {
    x: 0.5, y: 3.6, w: 12, h: 0.4,
    fontSize: 13, bold: true, color: C.navy, fontFace: F,
  });

  const quotes = [
    '"My son Arjun went missing at Pushkar Mela. A kind stranger called me within 7 minutes." — Rekha M., Jaipur · Child tag',
    '"My mother has dementia. She walked out 3 times last year. Each time a neighbour scanned her SafeTag." — Suresh V., Chennai · Elderly tag',
    '"A local farmer found me on a Himachal trek, scanned my keychain, reached my contact. No language barrier." — Ananya K., Mumbai · Traveler tag',
  ];
  quotes.forEach((q, i) => {
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 4.1 + i * 0.77, w: 12.3, h: 0.68, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.06 });
    s.addText('"' + q + '"', { x: 0.7, y: 4.16 + i * 0.77, w: 12.0, h: 0.56, fontSize: 11.5, color: C.slate, italic: true, fontFace: F });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 13 — TECHNOLOGY STACK
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  bar(s, C.teal);
  label(s, 'Technology');
  h1(s, 'Production-Ready Full-Stack Platform', 0.4, C.white);

  const tech = [
    { label: 'Backend',         value: 'Node.js 20 + Express 4 — single-process, zero microservices' },
    { label: 'Database / ORM',  value: 'Prisma v5 · SQLite (dev) · PostgreSQL (production)' },
    { label: 'Frontend',        value: 'EJS Server-Side Rendering · Tailwind CSS · Dark Mode (flash-free)' },
    { label: 'Auth & Security', value: 'express-session · bcryptjs · CSRF token on every state-changing form' },
    { label: 'QR Generation',   value: 'qrcode npm · PNG download · batch CSV export' },
    { label: 'NFC / RFID',      value: 'NDEF URL record · pre-programmed at manufacture time · iPhone 7+ & Android' },
    { label: 'Payments',        value: 'Razorpay (UPI, card, netbanking) + Cash on Delivery — no payment barrier' },
    { label: 'Alerts',          value: 'WhatsApp geolocation alert + Nodemailer email triggered on emergency scan' },
    { label: 'Deployment',      value: 'Render.com · PostgreSQL · ENV-driven config · < 30 s cold start' },
  ];

  tech.forEach((t, i) => {
    const y = 1.45 + i * 0.56;
    s.addShape(pptx.ShapeType.rect, { x: 0.5,  y, w: 2.9, h: 0.5, fill: { color: '0f2942' } });
    s.addText(t.label, { x: 0.5, y: y + 0.06, w: 2.9, h: 0.38, fontSize: 12, bold: true, color: C.tealL, align: 'center', fontFace: F });
    s.addShape(pptx.ShapeType.rect, { x: 3.4,  y, w: 9.4, h: 0.5, fill: { color: '091d30' } });
    s.addText(t.value, { x: 3.55, y: y + 0.1, w: 9.1, h: 0.3, fontSize: 12, color: 'cbd5e1', fontFace: F });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 14 — ROADMAP
// ════════════════════════════════════════════════════════
{
  const s = slide.white();
  bar(s, C.teal);
  label(s, 'Roadmap');
  h1(s, '18-Month Phased Growth Plan');

  const phases = [
    { phase: 'Phase 1',  period: 'Now — Month 6',     color: C.teal,   items: ['Launch online store & SEO', 'Onboard 10 manufacturers', 'Instagram + influencer marketing', '5,000 tags / month target', 'School pilot: 3 cities'] },
    { phase: 'Phase 2',  period: 'Month 6 — 12',      color: C.orange, items: ['B2B school & hospital pitch', 'WhatsApp Business API', 'Hindi UI full parity', 'Bulk order portal', '25,000 tags / month target'] },
    { phase: 'Phase 3',  period: 'Month 12 — 18',     color: C.indigo, items: ['Pan-India distribution', 'Govt & NGO partnerships', 'Offline retail pilot', 'IoT / GPS tag variant R&D', 'Series A preparation'] },
  ];

  phases.forEach((ph, i) => {
    const x = 0.5 + i * 4.3;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 4.0, h: 0.9, fill: { color: ph.color }, rectRadius: 0.08 });
    s.addText(ph.phase, { x, y: 1.6, w: 4.0, h: 0.44, fontSize: 18, bold: true, color: C.white, align: 'center', fontFace: F });
    s.addText(ph.period, { x, y: 2.0, w: 4.0, h: 0.38, fontSize: 11, color: C.white, align: 'center', fontFace: F });
    ph.items.forEach((item, j) => {
      const bg = j % 2 === 0 ? C.row0 : C.white;
      s.addShape(pptx.ShapeType.rect, { x, y: 2.55 + j * 0.78, w: 4.0, h: 0.72, fill: { color: bg }, line: { color: C.border, pt: 0.5 } });
      s.addText('✓  ' + item, { x: x + 0.15, y: 2.62 + j * 0.78, w: 3.7, h: 0.58, fontSize: 12.5, color: C.navy, fontFace: F });
    });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 15 — CLOSING / CTA
// ════════════════════════════════════════════════════════
{
  const s = slide.navy();
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0,    w: '100%', h: 0.45, fill: { color: C.teal } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.05, w: '100%', h: 0.45, fill: { color: C.teal } });

  s.addText('🏷️  SafeTag', {
    x: 1, y: 0.95, w: 11, h: 1.2,
    fontSize: 52, bold: true, color: C.white, align: 'center', fontFace: F,
  });
  s.addText('Scan. Know. Save a Life.', {
    x: 1, y: 2.25, w: 11, h: 0.6,
    fontSize: 22, color: C.tealL, align: 'center', fontFace: F,
  });
  s.addShape(pptx.ShapeType.rect, { x: 4.65, y: 3.05, w: 4.0, h: 0.05, fill: { color: C.teal } });
  s.addText("Let's protect every Indian family — together.", {
    x: 1, y: 3.2, w: 11, h: 0.55,
    fontSize: 16, color: C.slateL, align: 'center', fontFace: F,
  });

  s.addText('🌐  safe-tag.in', {
    x: 1, y: 4.15, w: 11, h: 0.52,
    fontSize: 19, bold: true, color: C.tealL, align: 'center', fontFace: F,
  });
  s.addText('📧  support@safe-tag.in', {
    x: 1, y: 4.72, w: 11, h: 0.48,
    fontSize: 15, color: C.slateL, align: 'center', fontFace: F,
  });
  s.addShape(pptx.ShapeType.rect, { x: 3.5, y: 5.45, w: 6.33, h: 0.65, fill: { color: C.teal }, rectRadius: 0.07 });
  s.addText('🛒  Buy Now — from ₹149', {
    x: 3.5, y: 5.5, w: 6.33, h: 0.55,
    fontSize: 16, bold: true, color: C.white, align: 'center', fontFace: F,
  });
  s.addText('🇮🇳  Made in India  ·  SDD v3.0  ·  Confidential', {
    x: 1, y: 6.55, w: 11, h: 0.4,
    fontSize: 10, color: '475569', align: 'center', fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// WRITE OUTPUT
// ════════════════════════════════════════════════════════
pptx.writeFile({ fileName: 'SafeTag-Business-PPT.pptx' })
  .then(() => console.log('✅  Saved: SafeTag-Business-PPT.pptx  (15 slides)'))
  .catch(err => { console.error('❌  Error:', err.message); process.exit(1); });

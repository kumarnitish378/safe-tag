// scripts/generate-ppt.js
// Usage: node scripts/generate-ppt.js
// Output: SafeTag-Business-PPT.pptx

const PptxGenJS = require('pptxgenjs');
const path = require('path');

const pptx = new PptxGenJS();
pptx.layout  = 'LAYOUT_WIDE'; // 13.33 × 7.5 inches
pptx.author  = 'SafeTag';
pptx.company = 'SafeTag India';
pptx.title   = 'SafeTag — Business Presentation';

// ── Image paths ─────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const img  = (name) => path.join(ROOT, 'public', 'images', name);

// ── Palette ──────────────────────────────────────────────
const C = {
  navy:   '0A2342',
  navyD:  '091224',
  navyM:  '0f1f38',
  teal:   '0D9488',
  tealL:  '5eead4',
  tealXL: 'ccfbf1',
  orange: 'F97316',
  white:  'FFFFFF',
  light:  'F8FAFC',
  slate:  '64748B',
  slateL: '94a3b8',
  green:  '22C55E',
  red:    'EF4444',
  redD:   '7f1d1d',
  indigo: '6366f1',
  row0:   'f0fdfa',
  border: 'e2e8f0',
};
const F = 'Calibri';

// ── Slide factories ──────────────────────────────────────
const mk = {
  navy:  () => { const s = pptx.addSlide(); s.background = { color: C.navy };  return s; },
  light: () => { const s = pptx.addSlide(); s.background = { color: C.light }; return s; },
  white: () => { const s = pptx.addSlide(); s.background = { color: C.white }; return s; },
};

// ── Helpers ──────────────────────────────────────────────
function bar(s, color = C.teal, h = 0.22) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h, fill: { color } });
}
function lbl(s, text) {
  s.addText(text.toUpperCase(), { x: 0.5, y: 0.06, w: 12, h: 0.22, fontSize: 9, bold: true, color: C.teal, charSpacing: 4, fontFace: F });
}
function h1(s, text, y = 0.4, color = C.navy) {
  s.addText(text, { x: 0.5, y, w: 12.3, h: 0.7, fontSize: 26, bold: true, color, fontFace: F, wrap: true });
}
function sub(s, text, y = 1.15, color = C.slate) {
  s.addText(text, { x: 0.5, y, w: 12.3, h: 0.45, fontSize: 13, color, fontFace: F });
}
function statBox(s, value, ltext, x, y, bg = C.teal, w = 2.9) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h: 1.7, fill: { color: bg }, rectRadius: 0.08 });
  s.addText(value, { x, y: y + 0.18, w, h: 0.75, fontSize: 30, bold: true, color: C.white, align: 'center', fontFace: F });
  s.addText(ltext, { x, y: y + 0.95, w, h: 0.55, fontSize: 11, color: C.white, align: 'center', fontFace: F, lineSpacingMultiple: 1.3 });
}
function pillar(s, x, title, color, items) {
  s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 4.0, h: 0.52, fill: { color }, rectRadius: 0.06 });
  s.addText(title, { x, y: 1.6, w: 4.0, h: 0.42, fontSize: 14, bold: true, color: C.white, align: 'center', fontFace: F });
  s.addShape(pptx.ShapeType.rect, { x, y: 2.07, w: 4.0, h: 5.1, fill: { color: C.navyM }, line: { color, pt: 1 }, rectRadius: 0.06 });
  items.forEach((item, j) => {
    s.addText('• ' + item, { x: x + 0.2, y: 2.2 + j * 0.82, w: 3.65, h: 0.75, fontSize: 12, color: 'cbd5e1', fontFace: F, lineSpacingMultiple: 1.3 });
  });
}
// Adds a photo on the right side with a dark navy overlay so text on left stays readable
function rightPhoto(s, imgPath, startX = 8.5) {
  const w = 13.33 - startX;
  s.addImage({ path: imgPath, x: startX, y: 0, w, h: 7.5, sizing: { type: 'cover', x: 0, y: 0, w, h: 7.5 } });
  s.addShape(pptx.ShapeType.rect, { x: startX, y: 0, w, h: 7.5, fill: { color: C.navyD, transparency: 40 } });
}

// ════════════════════════════════════════════════════════
// SLIDE 1 — TITLE  (hero-crowd-scan right panel + logo)
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();

  // Right photo panel
  rightPhoto(s, img('hero-crowd-scan.jpg'), 7.8);

  // Teal bars top + bottom
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0,    w: '100%', h: 0.38, fill: { color: C.teal } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.12, w: '100%', h: 0.38, fill: { color: C.teal } });

  // Logo + brand name
  s.addImage({ path: img('websiteLogo.png'), x: 0.5, y: 0.55, w: 1.3, h: 1.3 });
  s.addText('SafeTag', { x: 2.0, y: 0.62, w: 5.5, h: 1.1, fontSize: 52, bold: true, color: C.white, fontFace: F });
  s.addText('Scan. Know. Save a Life.', { x: 0.5, y: 1.85, w: 7.0, h: 0.55, fontSize: 21, color: C.tealL, fontFace: F });

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.58, w: 5.2, h: 0.05, fill: { color: C.teal } });
  s.addText("India's QR + NFC Emergency Identity Tag Platform", { x: 0.5, y: 2.72, w: 7.0, h: 0.48, fontSize: 14.5, color: C.slateL, fontFace: F });

  // Mini stat pills
  const stats = [['12,400+','Tags Activated'], ['182','Reunions'], ['< 3 s','Page Load']];
  stats.forEach(([v, l], i) => {
    const x = 0.5 + i * 2.45;
    s.addShape(pptx.ShapeType.rect, { x, y: 3.55, w: 2.2, h: 1.5, fill: { color: C.navyM }, rectRadius: 0.07 });
    s.addText(v, { x, y: 3.7,  w: 2.2, h: 0.55, fontSize: 22, bold: true, color: C.tealL, align: 'center', fontFace: F });
    s.addText(l, { x, y: 4.22, w: 2.2, h: 0.42, fontSize: 10, color: C.slateL, align: 'center', fontFace: F });
  });

  s.addText('B2C · B2B · Manufacturer Platform  ·  SDD v3.0', {
    x: 0.5, y: 6.6, w: 7.0, h: 0.38, fontSize: 11, color: '475569', fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 2 — THE PROBLEM  (usecase-child.jpg right panel)
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();
  bar(s, C.red);
  lbl(s, 'The Problem');
  rightPhoto(s, img('usecase-child.jpg'), 9.0);

  s.addText('"14 hours.  No ID.\nNo way to reach her family."', {
    x: 0.5, y: 0.4, w: 8.2, h: 1.05,
    fontSize: 24, bold: true, color: C.white, fontFace: F, lineSpacingMultiple: 1.3,
  });
  s.addText('A 6-year-old went missing at Kumbh Mela. With one small SafeTag, it would have ended in 7 minutes.', {
    x: 0.5, y: 1.55, w: 8.2, h: 0.6,
    fontSize: 13, color: C.tealL, fontFace: F, lineSpacingMultiple: 1.4,
  });

  statBox(s, '12,400+', 'Children missing\nevery month',  0.5,  2.4, C.red,   2.6);
  statBox(s, '14 hrs',  'Avg reunion\nwithout ID',        3.35, 2.4, C.redD,  2.6);
  statBox(s, 'Zero',    'Apps needed\nto scan',           6.2,  2.4, C.teal,  2.6);

  s.addText('The same crisis happens to elderly with dementia, accident victims, solo trekkers, and lost pets.\nSafeTag is built to end it — in under 3 seconds.', {
    x: 0.5, y: 4.5, w: 8.2, h: 0.7,
    fontSize: 12.5, color: C.slateL, fontFace: F, lineSpacingMultiple: 1.5,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 3 — THE SOLUTION  (hero-phone-scan center column)
// ════════════════════════════════════════════════════════
{
  const s = mk.light();
  bar(s, C.teal);
  lbl(s, 'The Solution');
  h1(s, 'SafeTag — One Tag. Two Technologies. Zero Apps.');

  // QR column
  s.addShape(pptx.ShapeType.rect, { x: 0.4, y: 1.35, w: 4.8, h: 4.9, fill: { color: C.white }, line: { color: C.border, pt: 1 }, rectRadius: 0.1 });
  s.addText('📷  QR Code', { x: 0.6, y: 1.55, w: 4.4, h: 0.5, fontSize: 19, bold: true, color: C.teal, fontFace: F });
  ['Any phone camera — point and scan', 'Works on Android, iPhone, feature phones', 'Opens in under 3 seconds', 'No login for the rescuer', 'Printable on any surface'].forEach((t, i) => {
    s.addText('✅  ' + t, { x: 0.6, y: 2.22 + i * 0.72, w: 4.4, h: 0.6, fontSize: 12.5, color: C.navy, fontFace: F });
  });

  // Center: phone scan photo
  s.addImage({ path: img('hero-phone-scan.jpg'), x: 5.35, y: 1.35, w: 2.65, h: 4.9, sizing: { type: 'cover', x: 0, y: 0, w: 2.65, h: 4.9 } });
  s.addShape(pptx.ShapeType.rect, { x: 5.35, y: 1.35, w: 2.65, h: 4.9, fill: { color: C.teal, transparency: 72 } });
  s.addShape(pptx.ShapeType.ellipse, { x: 5.93, y: 3.6, w: 1.5, h: 0.9, fill: { color: C.teal } });
  s.addText('+', { x: 5.93, y: 3.63, w: 1.5, h: 0.84, fontSize: 28, bold: true, color: C.white, align: 'center', fontFace: F });

  // NFC column
  s.addShape(pptx.ShapeType.rect, { x: 8.15, y: 1.35, w: 4.8, h: 4.9, fill: { color: C.white }, line: { color: C.border, pt: 1 }, rectRadius: 0.1 });
  s.addText('📡  RFID / NFC Chip', { x: 8.35, y: 1.55, w: 4.4, h: 0.5, fontSize: 19, bold: true, color: C.navy, fontFace: F });
  ['Tap phone near tag — no camera needed', 'Works in darkness or when QR is scratched', 'Water resistant — works in rain', 'Works at any angle, through wallets', 'iPhone 7+ and most Android phones'].forEach((t, i) => {
    s.addText('✅  ' + t, { x: 8.35, y: 2.22 + i * 0.72, w: 4.4, h: 0.6, fontSize: 12.5, color: C.navy, fontFace: F });
  });

  s.addShape(pptx.ShapeType.rect, { x: 0.4, y: 6.45, w: 12.5, h: 0.7, fill: { color: C.teal }, rectRadius: 0.06 });
  s.addText('DUAL PROTECTION — Either technology alone is enough. Both together mean there is no failure mode.', {
    x: 0.6, y: 6.52, w: 12.2, h: 0.56, fontSize: 13, bold: true, color: C.white, fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 4 — HOW IT WORKS  (step images in cards)
// ════════════════════════════════════════════════════════
{
  const s = mk.white();
  bar(s, C.teal);
  lbl(s, 'How It Works');
  h1(s, '4 Steps. No App Required. Works for Anyone.');

  const steps = [
    { n: '1', title: 'Buy & Attach',    body: 'Order a keychain, sticker,\nwristband, or ID card.\nAttach to bag or lanyard.', photo: img('product-keychain.jpg') },
    { n: '2', title: 'Set Up Profile',  body: 'Scan the QR, fill in name,\nblood group, contacts.\nTakes 2 minutes.',          photo: img('demoTag1.png') },
    { n: '3', title: 'Scan or Tap NFC', body: 'Anyone scans the QR or\ntaps the NFC chip.\nNo app. No account needed.',  photo: img('usecase-scan.jpg') },
    { n: '4', title: 'Instant Reunion', body: 'Profile opens in 3 sec.\nThey call directly.\nWhatsApp gets location.',     photo: img('hero-phone-scan.jpg') },
  ];

  steps.forEach((st, i) => {
    const x = 0.32 + i * 3.22;
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.75, y: 1.45, w: 0.95, h: 0.95, fill: { color: C.teal } });
    s.addText(st.n, { x: x + 0.75, y: 1.5, w: 0.95, h: 0.85, fontSize: 22, bold: true, color: C.white, align: 'center', fontFace: F });
    s.addShape(pptx.ShapeType.rect, { x, y: 2.55, w: 3.05, h: 4.7, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
    s.addImage({ path: st.photo, x: x + 0.1, y: 2.65, w: 2.85, h: 1.75, sizing: { type: 'cover', x: 0, y: 0, w: 2.85, h: 1.75 } });
    s.addText(st.title, { x, y: 4.5,  w: 3.05, h: 0.42, fontSize: 14, bold: true, color: C.teal, align: 'center', fontFace: F });
    s.addText(st.body,  { x: x + 0.1, y: 4.95, w: 2.85, h: 2.1, fontSize: 12, color: C.navy, align: 'center', fontFace: F, lineSpacingMultiple: 1.5 });
    if (i < 3) s.addText('→', { x: x + 3.03, y: 3.4, w: 0.22, h: 0.5, fontSize: 22, color: C.teal, fontFace: F });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 5 — PRODUCT RANGE  (real product photos)
// ════════════════════════════════════════════════════════
{
  const s = mk.light();
  bar(s, C.navy);
  lbl(s, 'Product Range');
  h1(s, 'Physical Tags — Every Lifestyle, Every Budget');

  const products = [
    { photo: img('product-stickers.jpg'),  name: 'QR Sticker',   price: '₹149', desc: 'Stick on helmet, wallet,\nbottle, school bag.\nWeather resistant.' },
    { photo: img('product-keychain.jpg'),  name: 'Keychain',     price: '₹249', desc: 'Attach to keys, bags,\nstroller, lanyard.\nDurable ABS plastic.' },
    { photo: img('product-wristband.jpg'), name: 'Wristband',    price: '₹349', desc: 'Silicone, waterproof.\nFor children, elderly,\nand athletes.' },
    { photo: img('demoTag1.png'),          name: 'RFID ID Card', price: '₹399', desc: 'PVC card format.\nSchools, hospitals,\ncorporate ID badges.' },
  ];

  products.forEach((p, i) => {
    const x = 0.5 + i * 3.22;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 3.05, h: 5.65, fill: { color: C.white }, line: { color: C.border, pt: 1 }, rectRadius: 0.12 });
    s.addImage({ path: p.photo, x: x + 0.08, y: 1.65, w: 2.9, h: 2.2, sizing: { type: 'cover', x: 0, y: 0, w: 2.9, h: 2.2 } });
    s.addText(p.name,  { x, y: 3.92, w: 3.05, h: 0.42, fontSize: 15, bold: true, color: C.navy, align: 'center', fontFace: F });
    s.addText(p.price, { x, y: 4.38, w: 3.05, h: 0.52, fontSize: 24, bold: true, color: C.teal, align: 'center', fontFace: F });
    s.addText('from',  { x, y: 4.86, w: 3.05, h: 0.28, fontSize: 10, color: C.slate, align: 'center', fontFace: F });
    s.addText(p.desc,  { x: x + 0.15, y: 5.18, w: 2.75, h: 1.8, fontSize: 12, color: C.slate, align: 'center', fontFace: F, lineSpacingMultiple: 1.4 });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 6 — TARGET SEGMENTS  (usecase photos in cards)
// ════════════════════════════════════════════════════════
{
  const s = mk.white();
  bar(s, C.teal);
  lbl(s, 'Target Market');
  h1(s, 'Who Needs an Emergency ID Tag?');
  sub(s, 'Anyone who could be separated from the people who love them — child, elder, traveler, or pet.');

  const segs = [
    { photo: img('usecase-child.jpg'),    label: 'Children',  desc: 'Lost at fairs, stations, temples.\n12,400+ children missing/month.' },
    { photo: img('usecase-elderly.jpg'),  label: 'Elderly',   desc: 'Dementia patients, seniors.\nStranger calls family in seconds.' },
    { photo: img('usecase-traveler.jpg'), label: 'Travelers', desc: 'Solo trips, Kumbh, pilgrimages.\nNo language barrier — anyone helps.' },
    { photo: img('usecase-pet.jpg'),      label: 'Pets',      desc: 'Lost dogs and cats.\nFinder calls owner directly.' },
    { photo: img('usecase-athlete.jpg'),  label: 'Athletes',  desc: 'Cyclists, trekkers, runners.\nFull medical info for paramedics.' },
    { photo: img('usecase-school.jpg'),   label: 'Schools',   desc: 'Bulk ID badges for school trips.\nEvery student identified in seconds.' },
  ];

  segs.forEach((sg, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.4 + col * 4.35, y = 1.95 + row * 2.3;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 4.1, h: 2.0, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
    s.addImage({ path: sg.photo, x: x + 0.1, y: y + 0.12, w: 1.2, h: 1.75, sizing: { type: 'cover', x: 0, y: 0, w: 1.2, h: 1.75 } });
    s.addText(sg.label, { x: x + 1.4, y: y + 0.12, w: 2.6, h: 0.44, fontSize: 14, bold: true, color: C.navy, fontFace: F });
    s.addText(sg.desc,  { x: x + 1.4, y: y + 0.6,  w: 2.6, h: 1.25, fontSize: 11.5, color: C.slate, fontFace: F, lineSpacingMultiple: 1.35 });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 7 — BUSINESS MODEL
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();
  bar(s, C.orange);
  lbl(s, 'Business Model');
  h1(s, 'Three Revenue Pillars — B2C + B2B + Manufacturer Platform', 0.4, C.white);
  pillar(s, 0.5,  '🛒  B2C Direct Sales',     C.teal,   ['Consumer buys via online store', 'Price: ₹149 – ₹499/unit', 'Razorpay + Cash on Delivery', 'Free shipping above ₹499', 'QR + NFC activation included']);
  pillar(s, 4.65, '🏫  B2B Institutional',    C.orange, ['Schools, hospitals, corporates', 'Bulk: 50 – 10,000 units', 'Volume pricing + SLA', 'CSV batch + custom branding', 'Recurring annual renewal']);
  pillar(s, 8.8,  '🏭  Manufacturer Platform',C.indigo, ['Factories list products on store', 'We provide tag IDs + QR + NFC CSV', 'Revenue share per sale', 'Activation analytics dashboard', 'Zero inventory for SafeTag']);
}

// ════════════════════════════════════════════════════════
// SLIDE 8 — UNIT ECONOMICS
// ════════════════════════════════════════════════════════
{
  const s = mk.light();
  bar(s, C.teal);
  lbl(s, 'Revenue & Pricing');
  h1(s, 'Unit Economics — Healthy Margins Across All Segments');

  const headers = ['Segment', 'Unit Price', 'Est. COGS', 'Gross Margin', 'Volume Potential'];
  const colW    = [2.9, 1.7, 1.55, 1.75, 2.5];
  const colX    = [0.3, 3.2, 4.9,  6.45, 8.2];
  const rows    = [
    ['QR Sticker (B2C)',    '₹149',    '₹35',  '76 %',      '50,000+ / yr'],
    ['Keychain (B2C)',      '₹249',    '₹65',  '74 %',      '30,000+ / yr'],
    ['Wristband (B2C)',     '₹349',    '₹90',  '74 %',      '20,000+ / yr'],
    ['School Bulk (B2B)',   '₹120 / u','₹35',  '71 %',      '1,00,000+ / yr'],
    ['Hospital Bulk (B2B)','₹150 / u','₹35',  '77 %',      '50,000+ / yr'],
    ['Manufacturer Fee',   '15 % rev','—',    'Pure SaaS', 'Scales with GMV'],
  ];

  headers.forEach((h, i) => {
    s.addShape(pptx.ShapeType.rect, { x: colX[i], y: 1.55, w: colW[i], h: 0.45, fill: { color: C.navy } });
    s.addText(h, { x: colX[i], y: 1.6, w: colW[i], h: 0.35, fontSize: 11, bold: true, color: C.white, align: 'center', fontFace: F });
  });
  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? C.white : 'f0fdfa';
    row.forEach((cell, ci) => {
      s.addShape(pptx.ShapeType.rect, { x: colX[ci], y: 2.0 + ri * 0.56, w: colW[ci], h: 0.53, fill: { color: bg }, line: { color: C.border, pt: 0.5 } });
      s.addText(cell, { x: colX[ci] + 0.06, y: 2.07 + ri * 0.56, w: colW[ci] - 0.12, h: 0.39, fontSize: 11, color: ci === 3 ? C.teal : C.navy, bold: ci === 3, align: ci === 0 ? 'left' : 'center', fontFace: F });
    });
  });
  s.addShape(pptx.ShapeType.rect, { x: 0.3, y: 5.5, w: 12.4, h: 0.65, fill: { color: C.navy }, rectRadius: 0.07 });
  s.addText('🎯  Target ARR — Year 1: ₹60 L   ·   Year 2: ₹2.5 Cr   ·   Year 3: ₹8 Cr+   ·   Break-even: Month 14–18', {
    x: 0.5, y: 5.56, w: 12.2, h: 0.53, fontSize: 13, bold: true, color: C.white, align: 'center', fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 9 — MARKET OPPORTUNITY  (crowd photo right panel)
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();
  rightPhoto(s, img('hero-crowd-scan.jpg'), 7.5);

  bar(s, C.teal);
  lbl(s, 'Market Opportunity');
  h1(s, "India's Emergency Safety Market\n— Largely Untapped", 0.4, C.white);

  statBox(s, '14 Cr+', 'Families with\nchildren under 15', 0.5,  1.75, C.teal,  3.2);
  statBox(s, '4 Cr+',  'Elderly &\ndementia families',    3.9,  1.75, '0f766e', 3.2);

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.65, w: 6.8, h: 0.65, fill: { color: C.navyM }, rectRadius: 0.06 });
  s.addText([
    { text: 'TAM  ', options: { bold: true, color: C.tealL } },
    { text: '~₹12,000 Cr   ', options: { color: C.white } },
    { text: 'SAM  ', options: { bold: true, color: C.tealL } },
    { text: '~₹1,800 Cr', options: { color: C.white } },
  ], { x: 0.7, y: 3.72, w: 6.4, h: 0.52, fontSize: 13, fontFace: F });

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 4.45, w: 6.8, h: 0.65, fill: { color: C.teal }, rectRadius: 0.06 });
  s.addText('SOM Target (Year 3)  ~₹250 Cr', { x: 0.7, y: 4.51, w: 6.4, h: 0.53, fontSize: 15, bold: true, color: C.white, fontFace: F });

  s.addText('No established national competitor in QR + NFC dual-tech emergency ID for India.', {
    x: 0.5, y: 5.3, w: 6.8, h: 0.55, fontSize: 12.5, color: C.slateL, fontFace: F, lineSpacingMultiple: 1.4,
  });
  s.addText('🏆  First-mover advantage in a ₹12,000 Cr market.', {
    x: 0.5, y: 6.0, w: 6.8, h: 0.42, fontSize: 14, bold: true, color: C.tealL, fontFace: F,
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 10 — COMPETITIVE EDGE
// ════════════════════════════════════════════════════════
{
  const s = mk.white();
  bar(s, C.teal);
  lbl(s, 'Competitive Edge');
  h1(s, 'Why SafeTag Wins — 6 Structural Advantages');

  const adv = [
    { icon: '📡', title: 'Dual QR + NFC',      desc: 'No competitor offers both. NFC works when QR fails — truly no failure mode.' },
    { icon: '📵', title: 'Zero App Friction',   desc: 'Rescuer needs nothing installed. Camera or NFC tap. Maximum adoption.' },
    { icon: '🇮🇳', title: 'India-First Design', desc: 'Hindi UI, Razorpay + COD, Indian address format, WhatsApp alerts.' },
    { icon: '🏭', title: 'Asset-Light Supply',  desc: 'Any Indian factory can list and ship. We own platform, not inventory.' },
    { icon: '⚡', title: 'Instant Activation',  desc: 'Customer scans → fills profile → tag live in 2 minutes.' },
    { icon: '🔒', title: 'Privacy by Design',   desc: 'Only accessible via physical scan. Not searchable. No data sold.' },
  ];

  adv.forEach((a, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.4 + col * 4.35, y = 1.65 + row * 2.2;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 4.1, h: 1.85, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.1 });
    s.addText(a.icon,  { x, y: y + 0.1, w: 1.1,  h: 1.55, fontSize: 28, align: 'center', fontFace: F });
    s.addText(a.title, { x: x + 1.0, y: y + 0.1, w: 3.0, h: 0.42, fontSize: 13, bold: true, color: C.navy, fontFace: F });
    s.addText(a.desc,  { x: x + 1.0, y: y + 0.55, w: 3.0, h: 1.2, fontSize: 11, color: C.slate, fontFace: F, lineSpacingMultiple: 1.3 });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 11 — GO-TO-MARKET
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();
  bar(s, C.orange);
  lbl(s, 'Go-to-Market');
  h1(s, 'Three-Channel Distribution Strategy', 0.4, C.white);
  pillar(s, 0.5,  '🛒  Online Direct',        C.teal,   ['safe-tag.in — SEO + Paid Ads', 'Instagram, Facebook, YouTube', 'Google Shopping for tags', 'Parenting & travel influencers', 'COD removes payment barrier']);
  pillar(s, 4.65, '🏫  Institutional B2B',    C.orange, ['Schools: safety ID for trips', 'Hospitals: patient wristbands', 'Corporate ID badge add-on', 'NGOs for child safety programs', 'Govt ICDS Anganwadi (LT)']);
  pillar(s, 8.8,  '🏭  Manufacturer Channel', C.indigo, ['Any Indian factory can list', 'We provide IDs + QR + NFC CSV', 'Factory makes & ships direct', 'Revenue share — zero CapEx', '10,000-tag batches, instant CSV']);
}

// ════════════════════════════════════════════════════════
// SLIDE 12 — TRACTION  (review avatar photos)
// ════════════════════════════════════════════════════════
{
  const s = mk.light();
  bar(s, C.green);
  lbl(s, 'Traction');
  h1(s, 'Platform Built. Community Growing. Reunions Happening.');

  statBox(s, '12,400+', 'Tags\nActivated',          0.5,  1.55, C.teal);
  statBox(s, '182',     'Verified\nReunions',        3.7,  1.55, C.green);
  statBox(s, '< 3 s',   'Emergency Page\nLoad Time', 6.9,  1.55, C.navy);
  statBox(s, '3+',      'Manufacturer\nPartners',    10.1, 1.55, C.indigo);

  s.addText('Verified customer stories:', { x: 0.5, y: 3.55, w: 12, h: 0.38, fontSize: 13, bold: true, color: C.navy, fontFace: F });

  const reviews = [
    { photo: img('review-rekha.jpg'),  name: 'Rekha M., Jaipur',   tag: 'Child tag',    quote: 'My son Arjun went missing at Pushkar Mela. A kind stranger called me within 7 minutes. Seven minutes.' },
    { photo: img('review-suresh.jpg'), name: 'Suresh V., Chennai', tag: 'Elderly tag',  quote: 'My mother has dementia. She walked out 3 times last year. Each time a neighbour scanned her SafeTag and called me.' },
    { photo: img('review-ananya.jpg'), name: 'Ananya K., Mumbai',  tag: 'Traveler tag', quote: 'A local farmer found me on a Himachal trek, scanned my keychain, reached my contact. No language barrier.' },
  ];

  reviews.forEach((r, i) => {
    const y = 4.05 + i * 1.02;
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 12.3, h: 0.9, fill: { color: C.row0 }, line: { color: C.tealXL, pt: 1 }, rectRadius: 0.07 });
    s.addImage({ path: r.photo, x: 0.62, y: y + 0.12, w: 0.66, h: 0.66 });
    s.addText(`"${r.quote}"`, { x: 1.42, y: y + 0.08, w: 9.5, h: 0.6, fontSize: 12, color: C.slate, italic: true, fontFace: F });
    s.addText(`— ${r.name} · ${r.tag}`, { x: 1.42, y: y + 0.62, w: 9.5, h: 0.24, fontSize: 10, bold: true, color: C.teal, fontFace: F });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 13 — TECHNOLOGY STACK
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();
  bar(s, C.teal);
  lbl(s, 'Technology');
  h1(s, 'Production-Ready Full-Stack Platform', 0.4, C.white);

  const tech = [
    { lbl: 'Backend',         val: 'Node.js 20 + Express 4 — single-process, zero microservices' },
    { lbl: 'Database / ORM',  val: 'Prisma v5 · SQLite (dev) · PostgreSQL (production)' },
    { lbl: 'Frontend',        val: 'EJS Server-Side Rendering · Tailwind CSS · Dark Mode (flash-free)' },
    { lbl: 'Auth & Security', val: 'express-session · bcryptjs · CSRF token on every state-changing form' },
    { lbl: 'QR Generation',   val: 'qrcode npm · PNG download · batch CSV export' },
    { lbl: 'NFC / RFID',      val: 'NDEF URL record · pre-programmed at manufacture · iPhone 7+ & Android' },
    { lbl: 'Payments',        val: 'Razorpay (UPI, card, netbanking) + Cash on Delivery — no payment barrier' },
    { lbl: 'Alerts',          val: 'WhatsApp geolocation alert + Nodemailer email on emergency scan' },
    { lbl: 'Deployment',      val: 'Render.com · PostgreSQL · ENV-driven config · < 30 s cold start' },
  ];

  tech.forEach((t, i) => {
    const y = 1.45 + i * 0.56;
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 2.9, h: 0.5, fill: { color: '0f2942' } });
    s.addText(t.lbl, { x: 0.5, y: y + 0.06, w: 2.9, h: 0.38, fontSize: 12, bold: true, color: C.tealL, align: 'center', fontFace: F });
    s.addShape(pptx.ShapeType.rect, { x: 3.4,  y, w: 9.4, h: 0.5, fill: { color: '091d30' } });
    s.addText(t.val, { x: 3.55, y: y + 0.1, w: 9.1, h: 0.3, fontSize: 12, color: 'cbd5e1', fontFace: F });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 14 — ROADMAP
// ════════════════════════════════════════════════════════
{
  const s = mk.white();
  bar(s, C.teal);
  lbl(s, 'Roadmap');
  h1(s, '18-Month Phased Growth Plan');

  const phases = [
    { phase: 'Phase 1', period: 'Now — Month 6',  color: C.teal,   items: ['Launch online store & SEO', 'Onboard 10 manufacturers', 'Instagram + influencer marketing', '5,000 tags / month target', 'School pilot: 3 cities'] },
    { phase: 'Phase 2', period: 'Month 6 — 12',   color: C.orange, items: ['B2B school & hospital pitch', 'WhatsApp Business API', 'Hindi UI full parity', 'Bulk order portal', '25,000 tags / month target'] },
    { phase: 'Phase 3', period: 'Month 12 — 18',  color: C.indigo, items: ['Pan-India distribution', 'Govt & NGO partnerships', 'Offline retail pilot', 'IoT / GPS tag variant R&D', 'Series A preparation'] },
  ];

  phases.forEach((ph, i) => {
    const x = 0.5 + i * 4.3;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 4.0, h: 0.9, fill: { color: ph.color }, rectRadius: 0.08 });
    s.addText(ph.phase,  { x, y: 1.6,  w: 4.0, h: 0.44, fontSize: 18, bold: true, color: C.white, align: 'center', fontFace: F });
    s.addText(ph.period, { x, y: 2.0,  w: 4.0, h: 0.38, fontSize: 11, color: C.white, align: 'center', fontFace: F });
    ph.items.forEach((item, j) => {
      s.addShape(pptx.ShapeType.rect, { x, y: 2.55 + j * 0.78, w: 4.0, h: 0.72, fill: { color: j % 2 === 0 ? C.row0 : C.white }, line: { color: C.border, pt: 0.5 } });
      s.addText('✓  ' + item, { x: x + 0.15, y: 2.62 + j * 0.78, w: 3.7, h: 0.58, fontSize: 12.5, color: C.navy, fontFace: F });
    });
  });
}

// ════════════════════════════════════════════════════════
// SLIDE 15 — CLOSING CTA  (hero-relief right panel + logo)
// ════════════════════════════════════════════════════════
{
  const s = mk.navy();

  // Right side: relief/paramedic photo
  rightPhoto(s, img('hero-relief.jpg'), 7.2);

  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0,    w: '100%', h: 0.42, fill: { color: C.teal } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.08, w: '100%', h: 0.42, fill: { color: C.teal } });

  s.addImage({ path: img('websiteLogo.png'), x: 0.5, y: 0.65, w: 1.45, h: 1.45 });
  s.addText('SafeTag', { x: 2.15, y: 0.7, w: 4.8, h: 1.1, fontSize: 48, bold: true, color: C.white, fontFace: F });
  s.addText('Scan. Know. Save a Life.', { x: 0.5, y: 1.9, w: 6.5, h: 0.55, fontSize: 19, color: C.tealL, fontFace: F });

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.65, w: 5.5, h: 0.04, fill: { color: C.teal } });
  s.addText("Let's protect every Indian family — together.", { x: 0.5, y: 2.8, w: 6.5, h: 0.5, fontSize: 13.5, color: C.slateL, fontFace: F });

  s.addText('🌐  safe-tag.in',         { x: 0.5, y: 3.7,  w: 6.5, h: 0.5, fontSize: 18, bold: true, color: C.tealL, fontFace: F });
  s.addText('📧  support@safe-tag.in', { x: 0.5, y: 4.26, w: 6.5, h: 0.45, fontSize: 15, color: C.slateL, fontFace: F });

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 5.1, w: 6.0, h: 0.72, fill: { color: C.teal }, rectRadius: 0.08 });
  s.addText('🛒  Buy Now — from ₹149', { x: 0.5, y: 5.17, w: 6.0, h: 0.58, fontSize: 16, bold: true, color: C.white, align: 'center', fontFace: F });

  s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 6.1, w: 6.0, h: 0.55, fill: { color: C.navyM }, rectRadius: 0.06 });
  s.addText('🇮🇳  Made in India  ·  SDD v3.0  ·  Confidential', { x: 0.5, y: 6.16, w: 6.0, h: 0.43, fontSize: 12, color: C.slateL, align: 'center', fontFace: F });
}

// ════════════════════════════════════════════════════════
// WRITE FILE
// ════════════════════════════════════════════════════════
pptx.writeFile({ fileName: 'SafeTag-Business-PPT.pptx' })
  .then(() => console.log('✅  Saved: SafeTag-Business-PPT.pptx  (15 slides + real photos)'))
  .catch(err => { console.error('❌  Error:', err.message); process.exit(1); });

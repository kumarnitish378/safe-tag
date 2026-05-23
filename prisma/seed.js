/**
 * Seed script: creates test accounts and two test tags.
 * Run via: npx prisma db seed
 *
 * Test accounts (matches MEMORY.md §7):
 *   admin@test.com    / Admin@1234  (admin user)
 *   customer@test.com / Test@1234   (regular customer)
 *   mfr@test.com      / Test@1234   (approved manufacturer)
 *
 * Test tags:
 *   TESTACT1 / testkey00001  → active tag with sample profile
 *   TESTINAC / testkey00002  → inactive tag (for registration flow)
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const SALT_ROUNDS = 10;

  // Users
  const adminHash = await bcrypt.hash('Admin@1234', SALT_ROUNDS);
  const testHash = await bcrypt.hash('Test@1234', SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      mobile: '9000000001',
      passwordHash: adminHash,
      name: 'Admin',
      isAdmin: true,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      mobile: '9000000002',
      passwordHash: testHash,
      name: 'Test Customer',
    },
  });

  // Manufacturer
  const mfr = await prisma.manufacturer.upsert({
    where: { email: 'mfr@test.com' },
    update: {},
    create: {
      email: 'mfr@test.com',
      mobile: '9000000003',
      passwordHash: testHash,
      businessName: 'Test Workshop',
      isApproved: true,
      address: '45 Industrial Area, Phase 2, Bengaluru 560058',
      description: 'Manufacturer of premium QR + RFID emergency identity tags.',
    },
  });

  // Demo products (approved)
  const demoProducts = [
    { name: 'SafeTag Classic Keychain', price: 14900, category: 'keychain', quantityAvailable: 200, isFeatured: true,  photoUrl: '/static/images/product-keychain.jpg',
      description: 'SafeTag Classic Keychain — the most popular choice for families.\n\nMaterial: High-grade ABS plastic with UV-resistant coating\n\nKey Features:\n• QR code laser-etched (scratch and fade resistant)\n• NFC chip: NTAG213, 13.56 MHz\n• Stainless steel split ring included\n• Waterproof and dustproof body\n\nWhat\'s in the box:\n1× SafeTag Keychain · 1× Tag ID card · 1× Setup guide\n\nWarranty: 1 year.' },
    { name: 'SafeTag Smart Card', price: 19900, category: 'card', quantityAvailable: 150, isFeatured: false, photoUrl: '/static/images/product-card.jpg',
      description: 'Slim PVC card — fits in any wallet or ID holder.\n\nMaterial: PVC, credit-card thickness (0.76 mm)\n\nKey Features:\n• QR code laminated (water-resistant)\n• NFC chip embedded (NTAG213)\n• ISO CR80 standard size\n\nWhat\'s in the box:\n1× SafeTag Card · 1× Tag ID card · 1× Setup guide\n\nIdeal for school ID lanyards and elderly wallets.' },
    { name: 'SafeTag Sticker Pack (3 pcs)', price: 24900, category: 'sticker', quantityAvailable: 500, isFeatured: false, photoUrl: '/static/images/product-stickers.jpg',
      description: 'Adhesive sticker tags — stick anywhere in seconds.\n\nMaterial: Polypropylene with 3M adhesive backing\n\nKey Features:\n• Pack of 3 uniquely coded stickers\n• High-resolution QR code (600 DPI)\n• Weatherproof — UV, water, and scratch resistant\n• 50×50 mm circular design\n\nWhat\'s in the box:\n3× SafeTag Stickers (each unique) · 3× Tag ID cards · 1× Setup guide\n\nBest for pet collars, bicycle helmets, school bags, luggage.' },
    { name: 'SafeTag Silicone Wristband', price: 34900, category: 'wristband', quantityAvailable: 100, isFeatured: false, photoUrl: '/static/images/product-wristband.jpg',
      description: 'Comfortable, durable wristband for children, athletes, and the elderly.\n\nMaterial: Medical-grade silicone, hypoallergenic\n\nKey Features:\n• QR code on stainless steel plate (inset)\n• NFC chip inside band (NTAG213)\n• Adjustable sizes: S / M / L\n• Waterproof — swim and shower safe\n\nWhat\'s in the box:\n1× SafeTag Wristband · 1× Tag ID card · 1× Setup guide\n\nBest for children, dementia patients, and marathon runners.' },
    { name: 'SafeTag Family Pack (3 Keychains)', price: 49900, category: 'keychain', quantityAvailable: 75, isFeatured: true,  photoUrl: '/static/images/product-family-pack.jpg',
      description: 'Protect the whole family with one order.\n\n3 Classic Keychains — each with a unique Tag ID, independent profile, and separate security key.\n\nKey Features:\n• 3 fully independent tags (not linked)\n• Each with QR + NFC\n• Mix of colours: Teal, Navy, Orange\n\nWhat\'s in the box:\n3× SafeTag Keychains · 3× Tag ID cards · 3× Setup guides\n\nWarranty: 1 year per piece.' },
  ];

  for (const p of demoProducts) {
    const existing = await prisma.productListing.findFirst({ where: { name: p.name, manufacturerId: mfr.id } });
    if (!existing) {
      await prisma.productListing.create({ data: { ...p, manufacturerId: mfr.id, isApproved: true } });
    }
  }
  console.log('  5 demo products seeded');

  // Active test tag with profile (owned by customer)
  const activeTag = await prisma.tag.upsert({
    where: { tagId: 'TESTACT1' },
    update: {},
    create: {
      tagId: 'TESTACT1',
      securityKey: 'testkey00001',
      isActive: true,
      ownerId: customer.id,
      activatedAt: new Date(),
    },
  });

  await prisma.medicalProfile.upsert({
    where: { tagId: 'TESTACT1' },
    update: {},
    create: {
      tagId: 'TESTACT1',
      name: 'Ravi Kumar',
      age: 35,
      mobilePrimary: '9876543210',
      bloodGroup: 'O+',
      address: '12 MG Road, Bengaluru 560001',
      medicalConditions: 'Mild hypertension',
      allergies: 'Penicillin',
      category: 'ADULT',
    },
  });

  // Inactive test tag (for registration flow)
  await prisma.tag.upsert({
    where: { tagId: 'TESTINAC' },
    update: {},
    create: {
      tagId: 'TESTINAC',
      securityKey: 'testkey00002',
      isActive: false,
    },
  });

  console.log('Seed complete.');
  console.log('  admin@test.com    / Admin@1234');
  console.log('  customer@test.com / Test@1234');
  console.log('  mfr@test.com      / Test@1234');
  console.log('  Tag TESTACT1/testkey00001 (active)');
  console.log('  Tag TESTINAC/testkey00002 (inactive)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

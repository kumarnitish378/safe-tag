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
  await prisma.manufacturer.upsert({
    where: { email: 'mfr@test.com' },
    update: {},
    create: {
      email: 'mfr@test.com',
      mobile: '9000000003',
      passwordHash: testHash,
      businessName: 'Test Workshop',
      isApproved: true,
    },
  });

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

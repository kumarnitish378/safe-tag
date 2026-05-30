/**
 * Render.com build step: patch schema.prisma sqlite → postgresql.
 * The repo keeps provider="sqlite" so local dev works with file:./prisma/dev.db.
 * This script is called in render.yaml before prisma generate + prisma db push.
 */
const fs   = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const schema     = fs.readFileSync(schemaPath, 'utf8');

if (schema.includes('provider = "postgresql"')) {
  console.log('[patch-schema] already postgresql — nothing to do');
  process.exit(0);
}

const patched = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
fs.writeFileSync(schemaPath, patched);
console.log('[patch-schema] sqlite → postgresql ✓');

/**
 * Render.com build step: patch schema.prisma sqlite → postgresql.
 * The repo keeps provider="sqlite" so local dev works with file:./prisma/dev.db.
 * This script is called in render.yaml before prisma generate + prisma db push.
 *
 * It also injects a `directUrl` so Prisma runs schema operations (db push /
 * migrate) over Neon's DIRECT (unpooled) connection, while the app's runtime
 * queries use the pooled `DATABASE_URL`. See the Neon "pooled vs direct" rule:
 * DDL over PgBouncer can fail ("prepared statement already exists"), so
 * migrations must use the -pooler-less host via DATABASE_URL_UNPOOLED.
 */
const fs   = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let   schema     = fs.readFileSync(schemaPath, 'utf8');

if (schema.includes('provider = "postgresql"')) {
  console.log('[patch-schema] already postgresql — nothing to do');
  process.exit(0);
}

schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');

// Add directUrl for migrations/db push (direct/unpooled connection) ONLY when
// DATABASE_URL_UNPOOLED is present in the build env. This keeps the deploy safe
// if that var isn't set yet: Prisma would otherwise fail validation with
// "Environment variable not found: DATABASE_URL_UNPOOLED".
if (process.env.DATABASE_URL_UNPOOLED && !schema.includes('directUrl')) {
  schema = schema.replace(
    'url      = env("DATABASE_URL")',
    'url       = env("DATABASE_URL")\n  directUrl = env("DATABASE_URL_UNPOOLED")'
  );
  console.log('[patch-schema] sqlite → postgresql + directUrl ✓');
} else {
  console.log('[patch-schema] sqlite → postgresql ✓ (no DATABASE_URL_UNPOOLED — skipping directUrl)');
}

fs.writeFileSync(schemaPath, schema);

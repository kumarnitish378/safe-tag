// Bearer-token authentication for the MCP endpoint. Only the SHA-256 hash of a
// token is stored (see the ApiToken model); the raw token is shown to the user
// once when created. Every MCP tool then acts as `req.mcpUser`.
const crypto = require('crypto');
const prisma = require('../db');

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Generate a new raw token + its hash. Prefixed so it's recognizable/greppable.
function generateApiToken() {
  const raw = 'stk_' + crypto.randomBytes(24).toString('hex');
  return { raw, hash: hashToken(raw) };
}

function unauthorized(res, message) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="SafeTag MCP"');
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: message || 'Unauthorized. Provide a SafeTag MCP token as a Bearer header.' },
    id: null,
  });
}

async function mcpAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return unauthorized(res);
  try {
    const tok = await prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(m[1].trim()) },
      include: { user: true },
    });
    if (!tok || tok.revokedAt || !tok.user || !tok.user.isActive) {
      return unauthorized(res, 'Invalid or revoked token.');
    }
    req.mcpUser = tok.user;
    req.mcpToken = tok;
    // best-effort last-used timestamp (never blocks the request)
    prisma.apiToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return next();
  } catch (e) {
    console.error('[mcpAuth]', e.message);
    return res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Auth error' }, id: null });
  }
}

module.exports = { mcpAuth, hashToken, generateApiToken };

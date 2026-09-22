// Builds an McpServer instance with all SafeTag tools registered, bound to a
// specific authenticated user (ctx.user). One instance is created per request
// (stateless Streamable HTTP).
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerShoppingTools } = require('./tools/shopping');
const { registerTagTools } = require('./tools/tags');

const pkg = require('../../package.json');

function buildMcpServer(ctx) {
  const server = new McpServer(
    { name: 'safetag', version: pkg.version || '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'SafeTag lets people buy QR+NFC emergency ID tags and manage the profile shown when a tag is scanned. ' +
        'Use the product tools to browse and place orders on the user\'s behalf (confirm product, quantity and ' +
        'shipping address first). Use the tag tools to activate tags and edit their profiles. Everything acts as ' +
        'the authenticated user; never invent a product id, order id, or tag code — look them up first.',
    },
  );
  registerShoppingTools(server, ctx);
  registerTagTools(server, ctx);
  return server;
}

module.exports = { buildMcpServer };

// MCP shopping tools — browse products, place orders (checkout on the user's
// behalf), and read order history. Every query is scoped to ctx.user.
const { z } = require('zod');
const prisma = require('../../db');
const { formatProduct, formatOrder } = require('../../helpers');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DUMMY_PAYMENT = process.env.DUMMY_PAYMENT !== 'false';
const RZP_KEY = process.env.RAZORPAY_KEY_ID || '';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const COD_FEE_PAISE = 3000; // +₹30 for Cash on Delivery (matches the web flow)

// Wrap a result as MCP content: human-readable text + machine-readable structuredContent.
function out(obj) {
  if (typeof obj === 'string') return { content: [{ type: 'text', text: obj }] };
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj };
}

function registerShoppingTools(server, ctx) {
  const user = ctx.user;

  server.registerTool('list_products', {
    title: 'List products',
    description: 'List SafeTag products available in the store (name, price in ₹, category, stock).',
    inputSchema: {},
  }, async () => {
    const rows = await prisma.productListing.findMany({
      where: { isApproved: true, isRejected: false },
      orderBy: { id: 'asc' },
    });
    const products = rows.map(formatProduct).map((p) => ({
      id: p.id, name: p.name, price_inr: p.price_inr, category: p.category,
      quantity_available: p.quantity_available, in_stock: p.quantity_available > 0,
    }));
    return out({ products });
  });

  server.registerTool('get_product', {
    title: 'Get product',
    description: 'Get full detail for one product by id.',
    inputSchema: { product_id: z.number().int().positive() },
  }, async ({ product_id }) => {
    const row = await prisma.productListing.findFirst({
      where: { id: product_id, isApproved: true, isRejected: false },
    });
    if (!row) return out('Product not found or unavailable.');
    const p = formatProduct(row);
    return out({
      id: p.id, name: p.name, description: p.description, price_inr: p.price_inr,
      category: p.category, quantity_available: p.quantity_available, in_stock: p.quantity_available > 0,
    });
  });

  server.registerTool('list_my_orders', {
    title: 'List my orders',
    description: "List the current user's SafeTag orders with status and tracking.",
    inputSchema: {},
  }, async () => {
    const rows = await prisma.order.findMany({
      where: { userId: user.id }, orderBy: { id: 'desc' }, include: { productListing: true },
    });
    return out({ orders: rows.map((o) => formatOrder(o, false, true)) });
  });

  server.registerTool('get_order', {
    title: 'Get order',
    description: "Get one of the user's orders by id.",
    inputSchema: { order_id: z.number().int().positive() },
  }, async ({ order_id }) => {
    const o = await prisma.order.findFirst({
      where: { id: order_id, userId: user.id }, include: { productListing: true },
    });
    if (!o) return out('Order not found.');
    return out(formatOrder(o, false, true));
  });

  server.registerTool('create_order', {
    title: 'Create order (checkout)',
    description:
      'Place an order for a product on the user\'s behalf. payment_method "cod" places a Cash-on-Delivery ' +
      'order immediately (+₹30 COD fee). "online" returns a Razorpay payment link the user opens to pay. ' +
      'A full shipping address is required. Confirm the product, quantity and address with the user before calling.',
    inputSchema: {
      product_id: z.number().int().positive(),
      quantity: z.number().int().min(1).max(50).default(1),
      payment_method: z.enum(['cod', 'online']),
      recipient_name: z.string().min(1),
      recipient_phone: z.string().min(6).max(20),
      address_line1: z.string().min(1),
      address_line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().min(1),
      pincode: z.string().min(4).max(10),
    },
  }, async (a) => {
    const product = await prisma.productListing.findFirst({
      where: { id: a.product_id, isApproved: true, isRejected: false },
    });
    if (!product) return out('Product not found or unavailable.');
    if (product.quantityAvailable < a.quantity) {
      return out(`Only ${product.quantityAvailable} unit(s) of "${product.name}" in stock.`);
    }
    const cod = a.payment_method === 'cod';
    const amount = product.price * a.quantity + (cod ? COD_FEE_PAISE : 0);
    const meta = {
      recipient_name: a.recipient_name, recipient_phone: a.recipient_phone,
      address_line1: a.address_line1, address_line2: a.address_line2 || '',
      city: a.city, state: a.state, pincode: a.pincode,
      payment_method: a.payment_method, email_sent: false, source: 'mcp',
    };

    // COD (or dummy/no-keys online) → place the order immediately.
    if (cod || DUMMY_PAYMENT || !RZP_KEY || !RZP_SECRET) {
      const order = await prisma.order.create({
        data: {
          userId: user.id, productListingId: product.id, quantity: a.quantity,
          amount, status: 'pending', shippingAddress: JSON.stringify(meta),
        },
      });
      await prisma.productListing.update({
        where: { id: product.id },
        data: { quantityAvailable: Math.max(0, product.quantityAvailable - a.quantity) },
      });
      return out({
        ok: true, order_id: order.id, amount_inr: amount / 100,
        payment: cod ? 'cod' : 'simulated',
        message: `Order #${order.id} placed for ${a.quantity}× ${product.name} — ` +
          (cod ? `Cash on Delivery, ₹${amount / 100}.` : `₹${amount / 100} (test/dummy payment).`),
      });
    }

    // Online → create the order (pending) and a Razorpay payment link.
    const order = await prisma.order.create({
      data: {
        userId: user.id, productListingId: product.id, quantity: a.quantity,
        amount, status: 'pending', shippingAddress: JSON.stringify(meta),
      },
    });
    try {
      const Razorpay = require('razorpay');
      const rzp = new Razorpay({ key_id: RZP_KEY, key_secret: RZP_SECRET });
      const link = await rzp.paymentLink.create({
        amount, currency: 'INR',
        description: `SafeTag order #${order.id} — ${product.name} x${a.quantity}`,
        customer: { name: a.recipient_name, contact: a.recipient_phone },
        notify: { sms: false, email: false },
        notes: { mcp_order_id: String(order.id), user_id: String(user.id) },
        callback_url: `${BASE_URL}/orders`, callback_method: 'get',
      });
      await prisma.productListing.update({
        where: { id: product.id },
        data: { quantityAvailable: Math.max(0, product.quantityAvailable - a.quantity) },
      });
      return out({
        ok: true, order_id: order.id, amount_inr: amount / 100, payment: 'online',
        payment_link: link.short_url,
        message: `Order #${order.id} created for ₹${amount / 100}. Ask the user to complete payment here: ${link.short_url}`,
      });
    } catch (e) {
      // roll back the pending order if the link couldn't be created
      await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
      return out(`Could not create a payment link: ${e.message}. Try Cash on Delivery instead.`);
    }
  });
}

module.exports = { registerShoppingTools };

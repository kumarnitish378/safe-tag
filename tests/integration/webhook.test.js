// Configure the webhook secret + disable SMTP BEFORE requiring the app
// (server.js reads these at module load / call time).
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

jest.mock('../../lib/db');

const crypto  = require('crypto');
const request = require('supertest');
const prisma  = require('../../lib/db');
const app     = require('../../server');

const SECRET = 'test_webhook_secret';
const sign = (raw) => crypto.createHmac('sha256', SECRET).update(raw).digest('hex');

function postSigned(bodyObj, signature) {
  const raw = JSON.stringify(bodyObj);
  return request(app)
    .post('/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signature || sign(raw))
    .send(raw);
}

const capturedEvent = (notes) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { order_id: 'order_xyz', id: 'pay_abc', notes } } },
});

describe('Razorpay webhook — POST /webhooks/razorpay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tagBatch.findFirst.mockResolvedValue(null);
    prisma.order.findFirst.mockResolvedValue(null);
    prisma.order.create.mockResolvedValue({ id: 99 });
    prisma.productListing.update.mockResolvedValue({});
    prisma.productListing.findUnique.mockResolvedValue({ id: 1, name: 'Tag', price: 14900, quantityAvailable: 10 });
    prisma.user.findUnique.mockResolvedValue({ id: 2, email: 'u@x.com' });
  });

  it('rejects an invalid signature with 400 and writes nothing', async () => {
    const res = await postSigned(capturedEvent({}), 'deadbeef');
    expect(res.status).toBe(400);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('reconstructs a store order from notes on payment.captured (browser-closed recovery)', async () => {
    const notes = {
      user_id: '2', product_id: '1', quantity: '1', payment_method: 'upi',
      recipient_name: 'Asha', recipient_phone: '9876500000',
      address_line1: '12 MG Road', address_line2: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
    };
    const res = await postSigned(capturedEvent(notes));
    expect(res.status).toBe(200);
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 2,
          razorpayOrderId: 'order_xyz',
          razorpayPaymentId: 'pay_abc',
        }),
      })
    );
    // shipping address from notes is persisted
    const created = prisma.order.create.mock.calls[0][0].data;
    expect(created.shippingAddress).toContain('Bengaluru');
  });

  it('is idempotent — does not recreate an order that already exists', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 5 }); // already created by the verify redirect
    const res = await postSigned(capturedEvent({ user_id: '2', product_id: '1' }));
    expect(res.status).toBe(200);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('ignores non-captured events', async () => {
    const res = await postSigned({ event: 'payment.failed', payload: {} });
    expect(res.status).toBe(200);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});

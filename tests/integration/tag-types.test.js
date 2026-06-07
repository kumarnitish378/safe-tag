jest.mock('../../lib/db');

const request = require('supertest');
const prisma  = require('../../lib/db');
const app     = require('../../server');

beforeEach(() => {
  prisma.tag.update.mockResolvedValue({});
});

describe('Multi-type scan dispatch — GET /t/:code', () => {
  it('renders the vCard page for an active vcard tag', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'card12345', tagType: 'vcard', isActive: true });
    prisma.tagProfile.findUnique.mockResolvedValue({
      tagId: 'card12345', type: 'vcard',
      data: JSON.stringify({ name: 'Ravi Traders', phone: '9876543210' }),
    });

    const res = await request(app).get('/t/card12345');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Ravi Traders/);
  });

  it('302-redirects a Smart Link tag to its destination URL', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'link12345', tagType: 'url', isActive: true });
    prisma.tagProfile.findUnique.mockResolvedValue({
      data: JSON.stringify({ url: 'https://example.com/landing' }),
    });

    const res = await request(app).get('/t/link12345');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/landing');
  });

  it('sends an inactive non-medical tag to registration', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'petAA1234', tagType: 'pet', isActive: false });

    const res = await request(app).get('/t/petAA1234');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/register\/petAA1234/);
  });

  it('404s a redirect tag whose destination URL is missing', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'link99999', tagType: 'url', isActive: true });
    prisma.tagProfile.findUnique.mockResolvedValue({ data: JSON.stringify({}) }); // no url
    const res = await request(app).get('/t/link99999');
    expect(res.status).toBe(404);
  });

  it('does not leak the vehicle owner number in the page text', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'carAA1234', tagType: 'vehicle', isActive: true });
    prisma.tagProfile.findUnique.mockResolvedValue({
      data: JSON.stringify({ name: 'Asha', vehicleNo: 'KA01AB1234', contact: '9876500000' }),
    });

    const res = await request(app).get('/t/carAA1234');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/9876500000/);            // number never sent to the page
    expect(res.text).toMatch(/\/t\/carAA1234\/notify/);    // reachable only via relay form
  });
});

describe('Generic registration — /register/:code', () => {
  it('renders the generic form for a non-medical tag', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'petAA1234', tagType: 'pet', isActive: false });

    const res = await request(app).get('/register/petAA1234');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Pet ID/);
  });

  it('activates the tag on a valid submission', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'petAA1234', tagType: 'pet', isActive: false });
    prisma.tagProfile.create.mockResolvedValue({});

    const res = await request(app).post('/register/petAA1234').type('form').send({
      petName: 'Bruno', ownerName: 'Ravi', contact: '9876543210',
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/t/petAA1234');
    expect(prisma.tagProfile.create).toHaveBeenCalled();
    expect(prisma.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true }) })
    );
  });

  it('re-renders with errors and saves nothing when required fields are missing', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'petAA1234', tagType: 'pet', isActive: false });
    prisma.tagProfile.create.mockClear();

    const res = await request(app).post('/register/petAA1234').type('form').send({ petName: '' });
    expect(res.status).toBe(200);
    expect(prisma.tagProfile.create).not.toHaveBeenCalled();
  });
});

describe('Collect submissions — POST /t/:code/submit', () => {
  it('stores a submission for an active survey tag', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'survey123', tagType: 'survey', isActive: true });
    prisma.tagProfile.findUnique.mockResolvedValue({
      data: JSON.stringify({ title: 'Feedback', questions: ['How was it?'] }),
    });
    prisma.submission.create.mockResolvedValue({});

    const res = await request(app).post('/t/survey123/submit').type('form').send({ q0: 'Great' });
    expect(res.status).toBe(302);
    expect(prisma.submission.create).toHaveBeenCalled();
  });

  it('silently drops honeypot (bot) submissions', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'survey123', tagType: 'survey', isActive: true });
    prisma.submission.create.mockClear();

    const res = await request(app).post('/t/survey123/submit').type('form').send({ q0: 'x', website: 'bot' });
    expect(res.status).toBe(302);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });
});

describe('Contact relay — POST /t/:code/notify', () => {
  it('records a contact message for a contact-relay tag', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'carAA1234', tagType: 'vehicle', isActive: true });
    prisma.submission.create.mockResolvedValue({});

    const res = await request(app).post('/t/carAA1234/notify').type('form')
      .send({ message: 'Your lights are on', reply: '9999999999' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/notified=1/);
    expect(prisma.submission.create).toHaveBeenCalled();
  });

  it('rejects notify for a non-relay type', async () => {
    prisma.tag.findUnique.mockResolvedValue({ tagId: 'card12345', tagType: 'vcard', isActive: true });
    prisma.submission.create.mockClear();

    const res = await request(app).post('/t/card12345/notify').type('form').send({ message: 'hi' });
    expect(res.status).toBe(404);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });
});

const {
  generateTagId,
  generateSecurityKey,
  generateTagCode,
  normaliseMobile,
  isValidMobile,
  isValidEmail,
  calcBatchPrice,
  validateListing,
  formatUser,
  formatManufacturer,
  formatProfile,
  formatTag,
  formatProduct,
  formatOrder,
} = require('../../lib/helpers');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

describe('generateTagId', () => {
  it('returns 6-char uppercase alphanumeric string by default', () => {
    const id = generateTagId();
    expect(id).toHaveLength(6);
    expect(/^[A-Z0-9]+$/.test(id)).toBe(true);
  });

  it('respects a custom length', () => {
    expect(generateTagId(10)).toHaveLength(10);
    expect(generateTagId(3)).toHaveLength(3);
  });

  it('produces different values on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateTagId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('generateSecurityKey', () => {
  it('returns an 8-char base64url string', () => {
    const key = generateSecurityKey();
    expect(key).toHaveLength(8);
    expect(/^[A-Za-z0-9_-]+$/.test(key)).toBe(true);
  });
});

describe('generateTagCode', () => {
  it('returns a 9-char base62 string', () => {
    const code = generateTagCode();
    expect(code).toHaveLength(9);
    expect(/^[A-Za-z0-9]+$/.test(code)).toBe(true);
  });

  it('produces different values on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateTagCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// normaliseMobile
// ---------------------------------------------------------------------------

describe('normaliseMobile', () => {
  it('returns plain 10-digit number as-is', () => {
    expect(normaliseMobile('9876543210')).toBe('9876543210');
  });

  it('strips leading +91 country code', () => {
    expect(normaliseMobile('+919876543210')).toBe('9876543210');
  });

  it('strips 91 prefix when total is 12 digits', () => {
    expect(normaliseMobile('919876543210')).toBe('9876543210');
  });

  it('strips leading 0 from 11-digit number', () => {
    expect(normaliseMobile('09876543210')).toBe('9876543210');
  });

  it('returns null for null input', () => {
    expect(normaliseMobile(null)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(normaliseMobile('')).toBe(null);
  });

  it('strips non-digit characters', () => {
    expect(normaliseMobile('98765-43210')).toBe('9876543210');
  });
});

// ---------------------------------------------------------------------------
// isValidMobile
// ---------------------------------------------------------------------------

describe('isValidMobile', () => {
  it.each(['9876543210', '8000000000', '7111111111', '6999999999'])(
    'accepts valid Indian mobile %s', (n) => {
      expect(isValidMobile(n)).toBe(true);
    }
  );

  it.each(['1234567890', '5000000000', '00000000000', '98765', '+12025551234'])(
    'rejects invalid number %s', (n) => {
      expect(isValidMobile(n)).toBe(false);
    }
  );

  it('accepts number with +91 prefix (normalised internally)', () => {
    expect(isValidMobile('+919876543210')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------

describe('isValidEmail', () => {
  it.each(['test@example.com', 'user+tag@domain.co.in', 'a@b.org'])(
    'accepts valid email %s', (e) => {
      expect(isValidEmail(e)).toBe(true);
    }
  );

  it.each(['notanemail', 'missing@', '@nodomain', '', null, 'spaces @example.com'])(
    'rejects invalid value %s', (e) => {
      expect(isValidEmail(e)).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// calcBatchPrice
// ---------------------------------------------------------------------------

describe('calcBatchPrice', () => {
  it('charges ₹5/tag (500 paise) for 1–100 units', () => {
    expect(calcBatchPrice(1)).toBe(500);
    expect(calcBatchPrice(100)).toBe(50000);
  });

  it('charges ₹3/tag (300 paise) for 101–1000 units', () => {
    expect(calcBatchPrice(101)).toBe(30300);
    expect(calcBatchPrice(1000)).toBe(300000);
  });

  it('charges ₹1.50/tag (150 paise) for 1001+ units', () => {
    expect(calcBatchPrice(1001)).toBe(150150);
    expect(calcBatchPrice(10000)).toBe(1500000);
  });
});

// ---------------------------------------------------------------------------
// validateListing
// ---------------------------------------------------------------------------

describe('validateListing', () => {
  const validData = {
    name: 'SafeTag Keychain v1',
    description: 'QR + NFC emergency keychain',
    price: '29900',
    category: 'keychain',
    quantity_available: '100',
  };

  it('returns no errors and parsed values for valid input', () => {
    const { errors, parsed } = validateListing(validData);
    expect(errors).toEqual({});
    expect(parsed.name).toBe('SafeTag Keychain v1');
    expect(parsed.price).toBe(29900);
    expect(parsed.category).toBe('keychain');
    expect(parsed.quantityAvailable).toBe(100);
  });

  it('errors on empty name in full mode', () => {
    const { errors } = validateListing({ ...validData, name: '' });
    expect(errors.name).toBeDefined();
  });

  it('errors on name shorter than 2 chars', () => {
    const { errors } = validateListing({ ...validData, name: 'X' });
    expect(errors.name).toBeDefined();
  });

  it('errors on invalid category', () => {
    const { errors } = validateListing({ ...validData, category: 'shoes' });
    expect(errors.category).toBeDefined();
  });

  it('accepts all valid categories', () => {
    for (const cat of ['keychain', 'card', 'sticker', 'wristband']) {
      const { errors } = validateListing({ ...validData, category: cat });
      expect(errors.category).toBeUndefined();
    }
  });

  it('errors on non-numeric price', () => {
    const { errors } = validateListing({ ...validData, price: 'free' });
    expect(errors.price).toBeDefined();
  });

  it('errors on negative price', () => {
    const { errors } = validateListing({ ...validData, price: '-100' });
    expect(errors.price).toBeDefined();
  });

  it('errors on negative quantity', () => {
    const { errors } = validateListing({ ...validData, quantity_available: '-1' });
    expect(errors.quantity_available).toBeDefined();
  });

  it('in partial mode, skips missing fields without error', () => {
    const { errors, parsed } = validateListing({ name: 'Updated' }, true);
    expect(errors).toEqual({});
    expect(parsed.name).toBe('Updated');
  });

  it('in partial mode, still validates fields that are present', () => {
    const { errors } = validateListing({ category: 'invalid' }, true);
    expect(errors.category).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

describe('formatUser', () => {
  const raw = {
    id: 1,
    email: 'user@example.com',
    mobile: '9876543210',
    name: 'Test User',
    isAdmin: false,
    isActive: true,
    createdAt: new Date('2024-06-01T00:00:00.000Z'),
  };

  it('maps all fields to snake_case', () => {
    const out = formatUser(raw);
    expect(out).toEqual({
      id: 1,
      email: 'user@example.com',
      mobile: '9876543210',
      name: 'Test User',
      is_admin: false,
      is_active: true,
      created_at: '2024-06-01T00:00:00.000Z',
    });
  });
});

describe('formatManufacturer', () => {
  it('maps business_name and approval flags', () => {
    const raw = {
      id: 2, businessName: 'Acme Tags', email: 'm@acme.com', mobile: '8000000000',
      address: '123 MG Road', description: 'Tag maker', isApproved: true, isBlocked: false,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const out = formatManufacturer(raw);
    expect(out.business_name).toBe('Acme Tags');
    expect(out.is_approved).toBe(true);
    expect(out.is_blocked).toBe(false);
  });
});

describe('formatTag', () => {
  const raw = {
    tagId: 'ABC123', isActive: true, scanCount: 5,
    createdAt: new Date('2024-01-01'), activatedAt: new Date('2024-02-01'),
    ownerId: 3, batchId: 1, manufacturerId: 1,
  };

  it('maps tag fields correctly', () => {
    const out = formatTag(raw);
    expect(out.tag_id).toBe('ABC123');
    expect(out.is_active).toBe(true);
    expect(out.scan_count).toBe(5);
  });

  it('includes profile when flag is set', () => {
    const tagWithProfile = { ...raw, profile: { id: 1, tagId: 'ABC123', name: 'Ravi', age: 30, mobilePrimary: '9876543210', theme: 'classic' } };
    const out = formatTag(tagWithProfile, true);
    expect(out.profile).toBeDefined();
    expect(out.profile.name).toBe('Ravi');
  });
});

describe('formatProduct', () => {
  it('converts price to INR correctly', () => {
    const raw = {
      id: 1, manufacturerId: 1, manufacturer: { businessName: 'Acme' },
      name: 'Keychain', description: 'Nice', price: 29900,
      category: 'keychain', quantityAvailable: 50,
      isApproved: true, isFeatured: false, isRejected: false,
      photoUrl: null, createdAt: new Date(),
    };
    const out = formatProduct(raw);
    expect(out.price).toBe(29900);
    expect(out.price_inr).toBe(299);
    expect(out.manufacturer_name).toBe('Acme');
  });
});

describe('formatOrder', () => {
  it('converts paise amount to INR', () => {
    const raw = {
      id: 1, userId: 1, productListingId: 1, quantity: 2,
      amount: 59800, status: 'pending', trackingId: null,
      razorpayOrderId: null, razorpayPaymentId: null,
      shippingAddress: '12 MG Road', createdAt: new Date(),
    };
    const out = formatOrder(raw);
    expect(out.amount_inr).toBe(598);
    expect(out.status).toBe('pending');
  });
});

const tt = require('../../lib/tagTypes');

describe('tagTypes registry', () => {
  it('treats empty/medical as medical, others as non-medical', () => {
    expect(tt.isMedical()).toBe(true);
    expect(tt.isMedical('medical')).toBe(true);
    expect(tt.isMedical('vcard')).toBe(false);
  });

  it('validates known types', () => {
    expect(tt.isValidType('medical')).toBe(true);
    expect(tt.isValidType('vcard')).toBe(true);
    expect(tt.isValidType('not-a-type')).toBe(false);
  });

  it('lists medical first, then the registry', () => {
    const ids = tt.listTypes().map(t => t.id);
    expect(ids[0]).toBe('medical');
    expect(ids).toEqual(expect.arrayContaining(['vcard', 'vehicle', 'pet', 'url', 'survey']));
  });
});

describe('validateProfile', () => {
  it('accepts a valid vcard and normalises the mobile', () => {
    const { errors, data } = tt.validateProfile('vcard', {
      name: 'Ravi', email: 'ravi@example.com', phone: '+91 98765 43210', website: 'https://x.com',
    });
    expect(Object.keys(errors)).toHaveLength(0);
    expect(data.name).toBe('Ravi');
    expect(data.phone).toBe('9876543210');
  });

  it('flags missing required fields', () => {
    const { errors } = tt.validateProfile('vcard', {});
    expect(errors.name).toBeTruthy();
  });

  it('rejects bad email and url', () => {
    const { errors } = tt.validateProfile('vcard', { name: 'A', email: 'nope', website: 'notaurl' });
    expect(errors.email).toBeTruthy();
    expect(errors.website).toBeTruthy();
  });

  it('splits a list field into trimmed non-empty lines', () => {
    const { data } = tt.validateProfile('catalog', { business: 'Acme', products: 'one\ntwo\n\n three ' });
    expect(data.products).toEqual(['one', 'two', 'three']);
  });

  it('returns a form error for an unknown type', () => {
    const { errors } = tt.validateProfile('ghost', { name: 'x' });
    expect(errors._form).toBeTruthy();
  });
});

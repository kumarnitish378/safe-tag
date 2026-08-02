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

describe('universal tag type', () => {
  it('recognises universal and accepts it as a valid batch type', () => {
    expect(tt.isUniversal('universal')).toBe(true);
    expect(tt.isUniversal('vcard')).toBe(false);
    expect(tt.isValidType('universal')).toBe(true);
  });

  it('offers universal in the manufacturer list but NOT as a user choice', () => {
    expect(tt.listTypes().map(t => t.id)).toContain('universal');
    expect(tt.choosableTypes().map(t => t.id)).not.toContain('universal');
  });

  it('lets a user choose any concrete type incl. medical, but not universal', () => {
    expect(tt.isChoosable('medical')).toBe(true);
    expect(tt.isChoosable('vcard')).toBe(true);
    expect(tt.isChoosable('universal')).toBe(false);
    expect(tt.isChoosable('nope')).toBe(false);
  });

  it('choosableTypes includes medical first and carries a theme for each', () => {
    const choices = tt.choosableTypes();
    expect(choices[0].id).toBe('medical');
    expect(choices.every(c => c.accent)).toBe(true);
  });

  describe('effectiveType', () => {
    it('returns the manufactured type for a normal tag', () => {
      expect(tt.effectiveType({ tagType: 'vcard', resolvedType: null })).toBe('vcard');
      expect(tt.effectiveType({ tagType: 'medical' })).toBe('medical');
    });
    it('returns resolvedType for an activated universal tag', () => {
      expect(tt.effectiveType({ tagType: 'universal', resolvedType: 'pet' })).toBe('pet');
    });
    it('falls back to universal (unresolved) then medical', () => {
      expect(tt.effectiveType({ tagType: 'universal', resolvedType: null })).toBe('universal');
      expect(tt.effectiveType(null)).toBe('medical');
    });
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

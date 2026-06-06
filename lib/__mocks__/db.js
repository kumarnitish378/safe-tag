// Jest manual mock for lib/db.js (Prisma client singleton).
// Every model method is a jest.fn() so individual tests can configure
// return values with .mockResolvedValue() / .mockRejectedValue().

const model = () => ({
  findUnique:  jest.fn(),
  findFirst:   jest.fn(),
  findMany:    jest.fn(),
  create:      jest.fn(),
  update:      jest.fn(),
  updateMany:  jest.fn(),
  delete:      jest.fn(),
  count:       jest.fn(),
  upsert:      jest.fn(),
});

const prismaMock = {
  tag:             model(),
  medicalProfile:  model(),
  tagProfile:      model(),
  submission:      model(),
  user:            model(),
  manufacturer:    model(),
  tagBatch:        model(),
  productListing:  model(),
  order:           model(),
  $disconnect:     jest.fn(),
};

module.exports = prismaMock;

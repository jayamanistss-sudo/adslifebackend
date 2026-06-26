import * as bcrypt from 'bcrypt';

describe('Password hashing (bcrypt)', () => {
  it('produces a valid hash from a plain password', async () => {
    const hash = await bcrypt.hash('TestPassword1!', 10);
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
  });

  it('verifies the correct password against its hash', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    await expect(bcrypt.compare('correct-horse', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await bcrypt.hash('correct-horse', 10);
    await expect(bcrypt.compare('wrong-password', hash)).resolves.toBe(false);
  });

  it('never produces the same hash twice (salted)', async () => {
    const [a, b] = await Promise.all([bcrypt.hash('same', 10), bcrypt.hash('same', 10)]);
    expect(a).not.toBe(b);
  });
});

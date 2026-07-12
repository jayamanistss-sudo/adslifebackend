import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AdsLife API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const testEmail = `e2e-test-${Date.now()}@example.com`;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    // Clean up the disposable test account this run created.
    await dataSource.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await app.close();
  });

  describe('Auth', () => {
    it('registers a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: 'E2E Test', email: testEmail, password: 'Test12345!', phone: '9000000099', city: 'Chennai' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.token).toBeDefined();
      token = res.body.data.token;
    });

    it('rejects a duplicate email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: 'E2E Test 2', email: testEmail, password: 'Test12345!', phone: '9000000098', city: 'Chennai' })
        .expect(409);

      expect(res.body.success).toBe(false);
    });

    it('rejects login with a wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'WrongPassword!' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('logs in with the correct password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Test12345!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });
  });

  describe('Vendor application lifecycle', () => {
    it('has no application before submitting', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/vendor-apply/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });

    it('submits a vendor application', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/vendor-apply/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ business_name: 'E2E Test Shop', category: 'food-dining', phone: '9000000099' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
    });

    it('reflects the pending application in status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/vendor-apply/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.business_name).toBe('E2E Test Shop');
    });

    it('rejects a second application while one is pending', async () => {
      // Note: the controller doesn't set @HttpCode here, so this still
      // returns Nest's default 201 for POST even though success is false —
      // worth tightening to a 409 in vendor-apply.controller.ts separately.
      const res = await request(app.getHttpServer())
        .post('/api/vendor-apply/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ business_name: 'E2E Test Shop 2', category: 'food-dining', phone: '9000000099' })
        .expect(201);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/already have a pending application/i);
    });

    it('rejects an unauthenticated submission', async () => {
      await request(app.getHttpServer())
        .post('/api/vendor-apply/submit')
        .send({ business_name: 'No Auth Shop', category: 'food-dining' })
        .expect(401);
    });
  });

  describe('Subscription plan offer limit', () => {
    let vendorToken: string;
    let vendorId: number;
    let maxOffers: number;

    beforeAll(async () => {
      // Fast-track this disposable user straight to an approved 'starter'-plan
      // vendor via direct DB writes — exercising the full apply→approve
      // flow isn't the point of this test, only the offer-limit enforcement.
      const userRow = await dataSource.query('SELECT id FROM users WHERE email = $1', [testEmail]);
      const userId = userRow[0].id;
      await dataSource.query("UPDATE users SET role = 'vendor' WHERE id = $1", [userId]);
      const vendorRow = await dataSource.query(
        `INSERT INTO vendors (user_id, business_name, status, subscription_plan)
         VALUES ($1, 'E2E Limit Shop', 'approved', 'starter') RETURNING id`,
        [userId],
      );
      vendorId = vendorRow[0].id;

      const plan = await dataSource.query("SELECT max_offers FROM subscription_plans WHERE slug = 'starter'");
      maxOffers = plan[0].max_offers;

      // Fresh login so the JWT's role claim reflects the 'vendor' role just set.
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Test12345!' })
        .expect(200);
      vendorToken = loginRes.body.data.token;
    });

    afterAll(async () => {
      await dataSource.query('DELETE FROM offers WHERE vendor_id = $1', [vendorId]);
      await dataSource.query('DELETE FROM vendors WHERE id = $1', [vendorId]);
    });

    it("allows creating up to the free plan's offer limit", async () => {
      for (let i = 0; i < maxOffers; i++) {
        await request(app.getHttpServer())
          .post('/api/offers')
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ title: `E2E Offer ${i + 1}` })
          .expect(201);
      }
    });

    it('rejects creating one more offer past the plan limit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/offers')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ title: 'E2E Offer Over Limit' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/plan allows up to/i);
    });

    it('frees up a slot after deactivating an offer', async () => {
      const offers = await dataSource.query('SELECT id FROM offers WHERE vendor_id = $1 LIMIT 1', [vendorId]);
      await request(app.getHttpServer())
        .put(`/api/offers/${offers[0].id}`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ title: 'E2E Offer 1', is_active: 0 })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/offers')
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ title: 'E2E Offer Replacement' })
        .expect(201);
    });
  });

  describe('Image upload validation', () => {
    it('rejects a disallowed mimetype', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', Buffer.from('<svg></svg>'), { filename: 'test.svg', contentType: 'image/svg+xml' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/JPEG, PNG, WebP, GIF/i);
    });

    it('rejects an unauthenticated upload', async () => {
      await request(app.getHttpServer())
        .post('/api/upload/image')
        .attach('image', Buffer.from('fake-png-bytes'), { filename: 'test.png', contentType: 'image/png' })
        .expect(401);
    });
  });
});

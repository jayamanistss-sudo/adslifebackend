export default () => ({
  port: parseInt(process.env.PORT || '3001', 10),
  appEnv: process.env.APP_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'adslife',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || '',
  },

  jwt: {
    secret: (() => {
      const s = process.env.JWT_SECRET;
      if (!s || s === 'adslife_jwt_secret_change_in_production') {
        throw new Error('JWT_SECRET env var is not set or is using the insecure default. Set a strong secret before starting.');
      }
      return s;
    })(),
    ttl: parseInt(process.env.JWT_TTL || '86400', 10),
    issuer: 'adslife.in',
    audience: 'adslife_users',
  },

  cashfree: {
    appId: process.env.CASHFREE_APP_ID || '',
    secretKey: process.env.CASHFREE_SECRET_KEY || '',
    webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || '',
    env: process.env.CASHFREE_ENV || 'sandbox',
    get baseUrl() {
      return this.env === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUri: process.env.GOOGLE_CALLBACK_URI || '',
  },

  mymemoryApi: 'https://api.mymemory.translated.net/get',
  nominatimApi: 'https://nominatim.openstreetmap.org',
});

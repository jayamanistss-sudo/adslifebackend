import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Parse cookies — required for httpOnly JWT cookie auth on web clients
  app.use(cookieParser());

  // Capture raw body for Razorpay webhook HMAC verification BEFORE json parsing
  app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

  // Security headers. Strict CSP everywhere by default; the relaxed policy
  // (inline scripts + jsdelivr CDN) applies only to the HTML pages that need
  // it: the landing page, the monitor dashboard, and Swagger UI.
  const strictHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });
  const relaxedHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'cdn.jsdelivr.net'],
      },
    },
  });
  app.use((req: any, res: any, next: any) => {
    const p = req.path;
    const needsRelaxed = p === '/' || p === '/index.html' || p === '/monitor' || p.startsWith('/docs');
    return (needsRelaxed ? relaxedHelmet : strictHelmet)(req, res, next);
  });

  // Request size limit (raised for base64-encoded image payloads, ~33% larger than the 5MB raw image)
  app.use(express.json({ limit: '15mb' }));

  // Serve landing page at root
  app.useStaticAssets(join(process.cwd(), 'public'));
  // Serve uploaded vendor images — resolve from project root, not dist/
  const projectRoot = join(__dirname, '..');
  app.useStaticAssets(join(projectRoot, 'uploads'), { prefix: '/uploads' });

  // Shortcut routes for static pages (before API prefix)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/monitor', (_req: any, res: any) => res.sendFile(join(process.cwd(), 'public', 'monitoring.html')));
  expressApp.get('/swagger', (_req: any, res: any) => res.redirect('/docs'));

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'https://adslife.in',
    'https://www.adslife.in',
    'https://dev.adslife.in',
    'https://test.adslife.in',
    'http://localhost:5173',
    'http://localhost:4173',
  ];
  const corsOrigins = allowedOrigins.length ? allowedOrigins : defaultOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (mobile apps, Postman, curl) and listed origins
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('AdsLife API')
    .setDescription('AdsLife offers & ads platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`AdsLife API running on http://localhost:${port}`);
}

bootstrap();

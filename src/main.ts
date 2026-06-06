import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Capture raw body for Cashfree webhook HMAC verification BEFORE json parsing
  app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

  // Security headers (CSP relaxed for monitor dashboard CDN assets)
  app.use(helmet({
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
  }));

  // Request size limit
  app.use(express.json({ limit: '10mb' }));

  // Serve landing page at root
  app.useStaticAssets(join(process.cwd(), 'public'));
  // Serve uploaded vendor images
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // Shortcut routes for static pages (before API prefix)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/monitor', (_req: any, res: any) => res.sendFile(join(process.cwd(), 'public', 'monitoring.html')));
  expressApp.get('/swagger', (_req: any, res: any) => res.redirect('/docs'));

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = new Set([
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'https://adslife.in',
        'https://www.adslife.in',
        'https://dev.adslife.in',
        'https://test.adslife.in',
        'https://adslifebackend.stss.in',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5500',
        'http://localhost:5500',
      ]);
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin || allowed.has(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
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

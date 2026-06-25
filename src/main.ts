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

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

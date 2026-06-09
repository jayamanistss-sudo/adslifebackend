import {
  Controller, Post, UseInterceptors, UploadedFile,
  UseGuards, BadRequestException, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 5 * 1024 * 1024;

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly config: ConfigService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(__dirname, '..', '..', 'uploads', 'vendors');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = MIME_EXT[file.mimetype] ?? '.bin';
          const unique = `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!MIME_EXT[file.mimetype]) {
          return cb(new BadRequestException('Only JPEG, PNG, WebP, GIF allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @Req() req: Request,
    @CurrentUser() _user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image uploaded');

    // Prefer explicit APP_URL env var to avoid leaking internal/private IPs.
    // Fall back to the forwarded proto+host only when APP_URL is not set.
    const configuredBase = this.config.get<string>('appUrl');
    let baseUrl: string;
    if (configuredBase) {
      baseUrl = configuredBase.replace(/\/$/, '');
    } else {
      const proto = req.get('x-forwarded-proto') ?? req.protocol ?? 'http';
      const host  = req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost:3001';
      baseUrl = `${proto}://${host}`;
    }

    const url = `${baseUrl}/uploads/vendors/${file.filename}`;
    return { success: true, data: { url, filename: file.filename, size: file.size } };
  }
}

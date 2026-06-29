import {
  Controller, Post, UseInterceptors, UploadedFile,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const ALLOWED_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};
const MAX_SIZE = 5 * 1024 * 1024;

/** Detect real MIME type from magic bytes — cannot be spoofed via Content-Type header */
function detectMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'images');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  @Post('image')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP or GIF — max 5MB' },
      },
      required: ['image'],
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      // Use memory storage so we can validate magic bytes before writing to disk
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIMES[file.mimetype]) {
          return cb(new BadRequestException('Only JPEG, PNG, WebP, GIF allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image uploaded');

    // Validate real content via magic bytes — Content-Type header is spoofable
    const realMime = detectMime(file.buffer);
    if (!realMime || !ALLOWED_MIMES[realMime]) {
      throw new BadRequestException('Only JPEG, PNG, WebP, GIF allowed');
    }

    const ext = ALLOWED_MIMES[realMime];
    const filename = `${randomUUID()}.${ext}`;
    const dest = join(UPLOAD_DIR, filename);

    // Write validated buffer to disk
    const { writeFileSync } = await import('node:fs');
    writeFileSync(dest, file.buffer);

    // Build public URL — prefer API_BASE_URL, fall back to APP_URL, then localhost
    const baseUrl = (process.env.API_BASE_URL ?? process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, '');
    const url = `${baseUrl}/uploads/images/${filename}`;

    return {
      success: true,
      data: { url, size: file.size, format: ext },
    };
  }
}

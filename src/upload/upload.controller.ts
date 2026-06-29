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

const ALLOWED_VIDEO_MIMES: Record<string, string> = {
  'video/mp4':  'mp4',
  'video/webm': 'webm',
};
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/** Detect real video MIME type from magic bytes */
function detectVideoMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // MP4/MOV: box size (4 bytes) + 'ftyp'
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4';
  // WebM/MKV: EBML header
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

const VIDEO_UPLOAD_DIR = join(process.cwd(), 'uploads', 'videos');
if (!existsSync(VIDEO_UPLOAD_DIR)) mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

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

  @Post('video')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        video: { type: 'string', format: 'binary', description: 'MP4 or WebM — max 50MB' },
      },
      required: ['video'],
    },
  })
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_VIDEO_MIMES[file.mimetype]) {
          return cb(new BadRequestException('Only MP4 or WebM allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No video uploaded');

    const realMime = detectVideoMime(file.buffer);
    if (!realMime || !ALLOWED_VIDEO_MIMES[realMime]) {
      throw new BadRequestException('Only MP4 or WebM allowed');
    }

    const ext = ALLOWED_VIDEO_MIMES[realMime];
    const filename = `${randomUUID()}.${ext}`;
    const dest = join(VIDEO_UPLOAD_DIR, filename);

    const { writeFileSync } = await import('node:fs');
    writeFileSync(dest, file.buffer);

    const baseUrl = (process.env.API_BASE_URL ?? process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, '');
    const url = `${baseUrl}/uploads/videos/${filename}`;

    return {
      success: true,
      data: { url, size: file.size, format: ext },
    };
  }
}

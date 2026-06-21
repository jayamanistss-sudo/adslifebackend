import {
  Controller, Post, UseInterceptors, UploadedFile,
  UseGuards, BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const ALLOWED_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};
const MAX_SIZE = 5 * 1024 * 1024;

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly config: ConfigService) {}

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

    const uploadDir = this.config.get<string>('upload.dir')!;
    const baseUrl   = this.config.get<string>('upload.baseUrl')!;
    const ext       = ALLOWED_MIMES[file.mimetype];
    const filename  = `${randomUUID()}.${ext}`;

    try {
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(join(uploadDir, filename), file.buffer);
    } catch (err: any) {
      throw new InternalServerErrorException(err?.message ?? 'Image upload failed, please try again');
    }

    return {
      success: true,
      data: {
        url:    `${baseUrl}/${filename}`,
        size:   file.size,
        format: ext,
      },
    };
  }
}

import {
  Controller, Post, UseInterceptors, UploadedFile,
  UseGuards, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 5 * 1024 * 1024;

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('cloudinary.cloudName'),
      api_key:    config.get<string>('cloudinary.apiKey'),
      api_secret: config.get<string>('cloudinary.apiSecret'),
    });
  }

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
        if (!ALLOWED_MIMES.has(file.mimetype)) {
          return cb(new BadRequestException('Only JPEG, PNG, WebP, GIF allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image uploaded');

    const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(b64, {
      folder: 'adslife/vendors',
      resource_type: 'image',
    });

    return {
      success: true,
      data: {
        url:       result.secure_url,
        public_id: result.public_id,
        width:     result.width,
        height:    result.height,
        size:      result.bytes,
        format:    result.format,
      },
    };
  }
}

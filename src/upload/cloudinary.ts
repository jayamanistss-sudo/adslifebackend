import { v2 as cloudinary } from 'cloudinary';

// Configured lazily on first call, not at module-import time: ConfigModule's
// dotenv loading happens inside AppModule's decorator, which runs AFTER this
// module's imports are resolved — process.env.CLOUDINARY_* isn't set yet
// if we config() at the top level.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

export function uploadBufferToCloudinary(
  buffer: Buffer,
  options: { folder: string; resource_type: 'image' | 'video' },
): Promise<{ secure_url: string; bytes: number; format: string }> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
      resolve(result as { secure_url: string; bytes: number; format: string });
    });
    stream.end(buffer);
  });
}

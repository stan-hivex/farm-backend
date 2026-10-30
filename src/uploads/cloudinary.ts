import { v2 as cloudinary } from 'cloudinary';

export function configureCloudinary(): void {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME?.trim() || process.env.CLOUD_NAME?.trim();
  const apiKey =
    process.env.CLOUDINARY_API_KEY?.trim() || process.env.CLOUD_KEY?.trim();
  const apiSecret =
    process.env.CLOUDINARY_API_SECRET?.trim() ||
    process.env.CLOUD_SECRET?.trim();
  const missing = [
    !cloudName && 'CLOUDINARY_CLOUD_NAME',
    !apiKey && 'CLOUDINARY_API_KEY',
    !apiSecret && 'CLOUDINARY_API_SECRET',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing Cloudinary configuration: ${missing.join(', ')}`);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export function cloudinaryErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as {
      message?: unknown;
      http_code?: unknown;
      error?: { message?: unknown };
    };
    const message =
      typeof details.error?.message === 'string'
        ? details.error.message
        : typeof details.message === 'string'
          ? details.message
          : 'Unknown Cloudinary error';
    return typeof details.http_code === 'number'
      ? `${message} (HTTP ${details.http_code})`
      : message;
  }
  return String(error);
}

export { cloudinary };

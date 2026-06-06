import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
  secure: true,
});

@Injectable()
export class CloudinaryService {
  async uploadBase64(base64: string, folder: string): Promise<string> {
    const response = await cloudinary.uploader.upload(
      `data:image/png;base64,${base64}`,
      { folder },
    );

    return response.secure_url;
  }
}

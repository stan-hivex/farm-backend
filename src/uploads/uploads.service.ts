import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Express } from 'express';
import type { UploadApiResponse } from 'cloudinary';
import {
  cloudinary,
  cloudinaryErrorMessage,
  configureCloudinary,
} from './cloudinary';

type UploadedImage = { url: string; public_id: string };

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  async uploadSingle(file: Express.Multer.File): Promise<UploadedImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Uploaded image is empty');
    }
    try {
      configureCloudinary();
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'farmapp', resource_type: 'image' },
          (error, response) => {
            if (error) return reject(error);
            if (!response)
              return reject(new Error('Cloudinary returned no result'));
            resolve(response);
          },
        );
        stream.on('error', reject);
        stream.end(file.buffer);
      });
      if (!result.secure_url || !result.public_id) {
        throw new Error('Cloudinary returned incomplete image details');
      }
      return { url: result.secure_url, public_id: result.public_id };
    } catch (error) {
      this.logger.error(
        `Cloudinary image upload failed: ${cloudinaryErrorMessage(error)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Could not upload image. Please try again.',
      );
    }
  }

  async uploadMultiple(files: Express.Multer.File[]): Promise<UploadedImage[]> {
    if (files.length < 1 || files.length > 5) {
      throw new BadRequestException('Upload between 1 and 5 images');
    }
    const uploaded: UploadedImage[] = [];
    for (const file of files) {
      uploaded.push(await this.uploadSingle(file));
    }
    return uploaded;
  }
}

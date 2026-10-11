import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
  secure: true,
});

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  async uploadBase64(base64: string, folder: string): Promise<string> {
    const response = await cloudinary.uploader.upload(
      `data:image/png;base64,${base64}`,
      { folder },
    );

    return response.secure_url;
  }

  async uploadSupportAttachment(
    mimeType: string,
    base64: string,
    ticketId: string,
  ): Promise<string> {
    const bytes = Buffer.from(base64, 'base64');
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `support/${ticketId}`,
          resource_type: mimeType.startsWith('video/') ? 'video' : 'image',
        },
        (error, result) => {
          if (error || !result?.secure_url) {
            const cause =
              error ?? new Error('Cloudinary returned no secure URL');
            this.logger.error(
              `Support attachment upload failed for ticket ${ticketId}: ${cause.message}`,
              cause.stack,
            );
            reject(
              new ServiceUnavailableException(
                'Could not store the attachment. Please try again.',
              ),
            );
            return;
          }
          resolve(result.secure_url);
        },
      );

      upload.end(bytes);
    });
  }

  async uploadEscrowEvidence(
    mimeType: string,
    base64: string,
    escrowId: string,
  ): Promise<string> {
    const response = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${base64}`,
      {
        folder: `escrow/${escrowId}/disputes`,
        resource_type: 'auto',
      },
    );

    return response.secure_url;
  }
}

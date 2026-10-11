import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { cloudinary } from '../uploads/cloudinary';

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
    try {
      const response = await cloudinary.uploader.upload(
        `data:${mimeType};base64,${base64}`,
        {
          folder: `support/${ticketId}`,
          resource_type: 'auto',
        },
      );
      if (!response.secure_url) {
        throw new Error('Cloudinary returned no secure URL');
      }
      return response.secure_url;
    } catch (error) {
      this.logger.error(
        `Support attachment upload failed for ticket ${ticketId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Could not store the attachment. Please try again.',
      );
    }
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

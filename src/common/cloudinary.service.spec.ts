import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService support attachments', () => {
  const cloudinaryEnv = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ] as const;
  const originalEnv = Object.fromEntries(
    cloudinaryEnv.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of cloudinaryEnv) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('streams decoded attachment bytes to the correct Cloudinary resource type', async () => {
    const fileBytes = Buffer.from('video-content');
    const uploadStream = jest
      .spyOn(cloudinary.uploader, 'upload')
      .mockResolvedValue({
        secure_url: 'https://res.cloudinary.com/demo/video/upload/file.mp4',
      } as any);
    const service = new CloudinaryService();

    await expect(
      service.uploadSupportAttachment(
        'video/mp4',
        fileBytes.toString('base64'),
        'ticket-1',
      ),
    ).resolves.toBe('https://res.cloudinary.com/demo/video/upload/file.mp4');

    expect(uploadStream).toHaveBeenCalledWith(
      `data:video/mp4;base64,${fileBytes.toString('base64')}`,
      expect.objectContaining({
        folder: 'support/ticket-1',
        resource_type: 'auto',
      }),
    );
  });

  it('logs Cloudinary failures and returns a retryable service error', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    jest
      .spyOn(cloudinary.uploader, 'upload')
      .mockRejectedValue(new Error('Upload rejected'));
    const service = new CloudinaryService();

    await expect(
      service.uploadSupportAttachment(
        'image/png',
        Buffer.from('image-content').toString('base64'),
        'ticket-2',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Support attachment upload failed for ticket ticket-2',
      ),
      expect.any(String),
    );
  });
});

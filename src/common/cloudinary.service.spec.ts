import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PassThrough } from 'stream';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService support attachments', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('streams decoded attachment bytes to the correct Cloudinary resource type', async () => {
    const fileBytes = Buffer.from('video-content');
    const receivedChunks: Buffer[] = [];
    const uploadStream = jest
      .spyOn(cloudinary.uploader, 'upload_stream')
      .mockImplementation(((options, callback) => {
        const stream = new PassThrough();
        stream.on('data', (chunk: Buffer) => receivedChunks.push(chunk));
        stream.on('finish', () => {
          callback(null, {
            secure_url: 'https://res.cloudinary.com/demo/video/upload/file.mp4',
          } as any);
        });
        return stream as any;
      }) as any);
    const service = new CloudinaryService();

    await expect(
      service.uploadSupportAttachment(
        'video/mp4',
        fileBytes.toString('base64'),
        'ticket-1',
      ),
    ).resolves.toBe('https://res.cloudinary.com/demo/video/upload/file.mp4');

    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'support/ticket-1',
        resource_type: 'video',
      }),
      expect.any(Function),
    );
    expect(Buffer.concat(receivedChunks)).toEqual(fileBytes);
  });

  it('logs Cloudinary failures and returns a retryable service error', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      _options,
      callback,
    ) => {
      const stream = new PassThrough();
      stream.on('finish', () =>
        callback(new Error('Upload rejected'), undefined),
      );
      return stream as any;
    }) as any);
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

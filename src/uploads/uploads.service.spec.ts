import { ServiceUnavailableException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { cloudinary } from './cloudinary';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('streams the uploaded image to the farmapp folder', async () => {
    const bytes = Buffer.from('image-content');
    const received: Buffer[] = [];
    const uploadStream = jest
      .spyOn(cloudinary.uploader, 'upload_stream')
      .mockImplementation(((options, callback) => {
        const stream = new PassThrough();
        stream.on('data', (chunk: Buffer) => received.push(chunk));
        stream.on('finish', () =>
          callback(null, {
            secure_url:
              'https://res.cloudinary.com/demo/image/upload/image.png',
            public_id: 'farmapp/image',
          } as any),
        );
        expect(options).toEqual({
          folder: 'farmapp',
          resource_type: 'image',
        });
        return stream as any;
      }) as any);

    await expect(
      new UploadsService().uploadSingle({
        buffer: bytes,
      } as Express.Multer.File),
    ).resolves.toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/image.png',
      public_id: 'farmapp/image',
    });
    expect(uploadStream).toHaveBeenCalledTimes(1);
    expect(Buffer.concat(received)).toEqual(bytes);
  });

  it('rejects failed Cloudinary uploads', async () => {
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((
      _options,
      callback,
    ) => {
      const stream = new PassThrough();
      stream.on('finish', () => callback(new Error('Cloudinary unavailable')));
      return stream as any;
    }) as any);

    await expect(
      new UploadsService().uploadSingle({
        buffer: Buffer.from('image-content'),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

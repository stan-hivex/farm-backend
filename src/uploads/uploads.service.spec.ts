import { ServiceUnavailableException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
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

  it('configures Cloudinary from environment values when called', () => {
    const configure = jest.spyOn(cloudinary, 'config');

    configureCloudinary();

    expect(configure).toHaveBeenCalledWith({
      cloud_name: 'test-cloud',
      api_key: 'test-key',
      api_secret: 'test-secret',
      secure: true,
    });
  });

  it('reports which Cloudinary settings are missing without exposing secrets', () => {
    delete process.env.CLOUDINARY_API_SECRET;

    expect(() => configureCloudinary()).toThrow(
      'Missing Cloudinary configuration: CLOUDINARY_API_SECRET',
    );
  });

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

  it('uploads multiple images sequentially and preserves their order', async () => {
    const service = new UploadsService();
    let activeUploads = 0;
    let maxActiveUploads = 0;
    jest.spyOn(service, 'uploadSingle').mockImplementation(async (file) => {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeUploads -= 1;
      return {
        url: `https://res.cloudinary.com/demo/${file.originalname}`,
        public_id: file.originalname,
      };
    });
    const files = [
      { originalname: 'front.jpg' },
      { originalname: 'selfie.jpg' },
    ] as Express.Multer.File[];

    await expect(service.uploadMultiple(files)).resolves.toEqual([
      {
        url: 'https://res.cloudinary.com/demo/front.jpg',
        public_id: 'front.jpg',
      },
      {
        url: 'https://res.cloudinary.com/demo/selfie.jpg',
        public_id: 'selfie.jpg',
      },
    ]);
    expect(maxActiveUploads).toBe(1);
  });
});

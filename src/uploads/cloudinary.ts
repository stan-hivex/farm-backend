import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ?? process.env.CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET ?? process.env.CLOUD_SECRET,
  secure: true,
});

export { cloudinary };

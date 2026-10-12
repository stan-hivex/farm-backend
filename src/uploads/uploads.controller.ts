import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../common/guards/jwt.guard';
import { UploadsService } from './uploads.service';

const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const allowedExtensions = /\.(jpe?g|png|webp)$/i;
    if (
      !allowedMimeTypes.has(file.mimetype) ||
      !allowedExtensions.test(file.originalname)
    ) {
      return callback(
        new BadRequestException('Only JPG, PNG, and WebP images are supported'),
        false,
      );
    }
    callback(null, true);
  },
};

@UseGuards(JwtGuard)
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  async uploadSingle(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('An image file is required');
    const uploaded = await this.uploadsService.uploadSingle(file);
    return { url: uploaded.url };
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('images', 5, imageUploadOptions))
  async uploadMultiple(@UploadedFiles() files?: Express.Multer.File[]) {
    if (!files?.length)
      throw new BadRequestException('At least one image is required');
    const uploaded = await this.uploadsService.uploadMultiple(files);
    return { urls: uploaded.map((image) => image.url) };
  }
}

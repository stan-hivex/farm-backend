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
import type { Express } from 'express';
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

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const documentUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowedMimeTypes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    if (
      !allowedMimeTypes.has(file.mimetype) ||
      !/\.(pdf|jpe?g|png|webp)$/i.test(file.originalname)
    ) {
      return callback(
        new BadRequestException(
          'Only PDF, JPG, PNG and WebP files are supported',
        ),
        false,
      );
    }
    callback(null, true);
  },
};

/** Checks the file's magic bytes so a renamed file cannot pass as a PDF/image. */
export function detectDocumentKind(buffer: Buffer): 'pdf' | 'image' | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'image';
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image';
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image';
  return null;
}

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

  @Post('document')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  async uploadDocument(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A file is required');
    const kind = detectDocumentKind(file.buffer);
    const declaredPdf = file.mimetype === 'application/pdf';
    if (!kind || (kind === 'pdf') !== declaredPdf) {
      throw new BadRequestException('File content does not match its type');
    }
    const uploaded = await this.uploadsService.uploadDocument(file, kind);
    return { url: uploaded.url, file_name: file.originalname, kind };
  }
}

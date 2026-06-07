import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CloudinaryService } from '../common/cloudinary.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  async submit(userId: string, dto: {
    document_type: string;
    document_number?: string;
    front_image: string;
    back_image?: string;
    selfie_image?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: string;
    nationality?: string;
    phone?: string;
    email?: string;
    country?: string;
    state?: string;
    city?: string;
    address?: string;
    postal_code?: string;
  }) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.kyc_status === 'verified') throw new BadRequestException('KYC already verified');

    const existingSubmission = await this.prisma.kyc_documents.findFirst({
      where: {
        user_id: userId,
        status: { in: ['pending', 'under_review'] },
      },
    });
    if (existingSubmission) {
      throw new BadRequestException('You already have a KYC submission in progress');
    }

    // Upload images to Cloudinary (log and fail gracefully)
    let frontUrl: string | null = null;
    let backUrl: string | null = null;
    let selfieUrl: string | null = null;
    try {
      const cloud = new CloudinaryService();
      frontUrl = await cloud.uploadBase64(dto.front_image, 'kyc');
      backUrl = dto.back_image ? await cloud.uploadBase64(dto.back_image, 'kyc') : null;
      selfieUrl = dto.selfie_image ? await cloud.uploadBase64(dto.selfie_image, 'kyc') : null;
    } catch (e) {
      // Log cloud upload error but continue to store base64 as fallback
      // so users can still submit KYC while we investigate Cloudinary issues.
      // eslint-disable-next-line no-console
      console.error('KYC Cloudinary upload failed:', e instanceof Error ? e.stack || e.message : String(e));
    }

    let doc;
    try {
      doc = await this.prisma.kyc_documents.create({
        data: {
          user_id: userId,
          document_type: dto.document_type,
          document_number: dto.document_number,

          // NEW (production - Cloudinary URLs)
          front_image_url: frontUrl,
          back_image_url: backUrl,
          selfie_image_url: selfieUrl,

          // OLD (temporary fallback - base64)
          front_image: dto.front_image,
          back_image: dto.back_image,
          selfie_image: dto.selfie_image,

          status: 'pending',
        },
      });
    } catch (err) {
      // Prisma/schema errors will surface here; log details and return 500
      // eslint-disable-next-line no-console
      console.error('Prisma create kyc_documents failed:', err instanceof Error ? err.stack || err.message : String(err));
      throw new InternalServerErrorException('Failed to save KYC submission');
    }

    const updateData: any = { kyc_status: 'pending' };
    if (dto.first_name) updateData.first_name = dto.first_name;
    if (dto.last_name) updateData.last_name = dto.last_name;
    if (dto.date_of_birth) updateData.date_of_birth = dto.date_of_birth;
    if (dto.country) updateData.country = dto.country;
    if (dto.city) updateData.city = dto.city;
    if (dto.address) updateData.address = dto.address;

    if (Object.keys(updateData).length > 1) {
      await this.prisma.users.update({
        where: { id: userId }, data: updateData,
      });
    } else {
      await this.prisma.users.update({
        where: { id: userId }, data: { kyc_status: 'pending' },
      });
    }

    return { data: doc, message: 'KYC submitted. Your documents will be reviewed shortly.' };
  }

  async getMyKyc(userId: string) {
    const docs = await this.prisma.kyc_documents.findMany({
      where: { user_id: userId }, orderBy: { created_at: 'desc' },
    });
    return { data: docs };
  }

  async getQueue(query: any) {
    const { skip, take, page, limit } = paginationParams(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.prisma.kyc_documents.findMany({
        where: { status: 'pending' }, skip, take,
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          user_id: true,
          document_type: true,
          document_number: true,
          created_at: true,
          front_image: true,
          back_image: true,
          selfie_image: true,
          status: true,
          reviewed_by: true,
          rejection_reason: true,
          reviewed_at: true,
          users_kyc_documents_user_idTousers: {
            select: { id: true, first_name: true, last_name: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
    ]);
    return { data: items, meta: paginate(total, page, limit) };
  }

  async review(docId: string, reviewerId: string, dto: {
    status: 'under_review' | 'verified' | 'rejected' | 'additional_info_required';
    rejection_reason?: string;
  }) {
    const doc = await this.prisma.kyc_documents.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundException('KYC document not found');
    if (doc.status !== 'pending') throw new BadRequestException('Document already reviewed');

    await this.prisma.kyc_documents.update({
      where: { id: docId },
      data: {
        status: dto.status,
        reviewed_by: reviewerId,
        rejection_reason: dto.rejection_reason,
        reviewed_at: new Date(),
      },
    });
    await this.prisma.users.update({
      where: { id: doc.user_id! }, data: { kyc_status: dto.status },
    });
    return { message: `KYC ${dto.status}` };
  }
}
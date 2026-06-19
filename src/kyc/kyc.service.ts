import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CloudinaryService } from '../common/cloudinary.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  private normalizeValue(value?: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private computeKycLevel(data: any) {
    const first_name = this.normalizeValue(data.first_name);
    const last_name = this.normalizeValue(data.last_name);
    const date_of_birth = this.normalizeValue(data.date_of_birth || data.dob);
    const phone = this.normalizeValue(data.phone);
    const email = this.normalizeValue(data.email);
    const document_type = this.normalizeValue(data.document_type);
    const document_number = this.normalizeValue(data.document_number);
    const front_image = this.normalizeValue(data.front_image);
    const back_image = this.normalizeValue(data.back_image);
    const selfie_image = this.normalizeValue(data.selfie_image);
    const country = this.normalizeValue(data.country);
    const county = this.normalizeValue(data.county || data.state);
    const city = this.normalizeValue(data.city);
    const address = this.normalizeValue(data.physical_address || data.address);
    const postal_code = this.normalizeValue(data.postal_code);

    const hasPersonalInfo = Boolean(first_name && last_name && (date_of_birth || phone || email));
    if (!hasPersonalInfo) return 0;

    const hasDocumentVerification = Boolean(document_type && (document_number || front_image || back_image || selfie_image));
    if (!hasDocumentVerification) return 1;

    const hasAddressVerification = Boolean(country && county && city && address && postal_code);
    if (!hasAddressVerification) return 2;

    return 3;
  }

  private buildKycDocumentPayload(existing: any, dto: any, urls: { front?: string | null; back?: string | null; selfie?: string | null }) {
    return {
      document_type: dto.document_type ?? existing?.document_type,
      document_number: dto.document_number ?? existing?.document_number,
      front_image: dto.front_image ?? existing?.front_image,
      back_image: dto.back_image ?? existing?.back_image,
      selfie_image: dto.selfie_image ?? existing?.selfie_image,
      front_image_url: dto.front_image ? urls.front : existing?.front_image_url ?? null,
      back_image_url: dto.back_image ? urls.back : existing?.back_image_url ?? null,
      selfie_image_url: dto.selfie_image ? urls.selfie : existing?.selfie_image_url ?? null,
      first_name: dto.first_name ?? existing?.first_name,
      last_name: dto.last_name ?? existing?.last_name,
      date_of_birth: dto.dob ?? existing?.date_of_birth,
      gender: dto.gender ?? existing?.gender,
      nationality: dto.nationality ?? existing?.nationality,
      phone: dto.phone ?? existing?.phone,
      email: dto.email ?? existing?.email,
      country: dto.country ?? existing?.country,
      county: dto.state ?? existing?.county,
      city: dto.city ?? existing?.city,
      physical_address: dto.address ?? existing?.physical_address,
      postal_code: dto.postal_code ?? existing?.postal_code,
      status: 'pending' as any,
    };
  }

  async submit(userId: string, dto: {
    document_type?: string;
    document_number?: string;
    front_image?: string;
    back_image?: string;
    selfie_image?: string;
    first_name?: string;
    last_name?: string;
    dob?: string;
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
        status: { in: ['pending', 'under_review', 'additional_info_required'] },
      },
    });

    let frontUrl: string | null = null;
    let backUrl: string | null = null;
    let selfieUrl: string | null = null;
    try {
      const cloud = new CloudinaryService();
      if (dto.front_image) frontUrl = await cloud.uploadBase64(dto.front_image, 'kyc');
      if (dto.back_image) backUrl = await cloud.uploadBase64(dto.back_image, 'kyc');
      if (dto.selfie_image) selfieUrl = await cloud.uploadBase64(dto.selfie_image, 'kyc');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('KYC Cloudinary upload failed:', e instanceof Error ? e.stack || e.message : String(e));
    }

    let doc;
    try {
      if (existingSubmission) {
        const updateData = this.buildKycDocumentPayload(existingSubmission, dto, {
          front: frontUrl,
          back: backUrl,
          selfie: selfieUrl,
        });
        doc = await this.prisma.kyc_documents.update({
          where: { id: existingSubmission.id },
          data: updateData,
        });
      } else {
        doc = await this.prisma.kyc_documents.create({
          data: {
            user_id: userId,
            ...this.buildKycDocumentPayload(null, dto, {
              front: frontUrl,
              back: backUrl,
              selfie: selfieUrl,
            }),
          },
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Prisma save kyc_documents failed:', err instanceof Error ? err.stack || err.message : String(err));
      throw new InternalServerErrorException('Failed to save KYC submission');
    }

    const mergedDocData = {
      ...existingSubmission,
      ...dto,
      state: dto.state ?? existingSubmission?.county,
      address: dto.address ?? existingSubmission?.physical_address,
      date_of_birth: dto.dob ?? existingSubmission?.date_of_birth,
    };
    const kycLevel = this.computeKycLevel(mergedDocData);

    const updateData: any = {
      kyc_status: 'pending',
      kyc_level: kycLevel,
    };
    if (dto.first_name) updateData.first_name = dto.first_name;
    if (dto.last_name) updateData.last_name = dto.last_name;
    if (dto.country) updateData.country = dto.country;
    if (dto.city) updateData.city = dto.city;
    if (dto.address) updateData.address = dto.address;

    await this.prisma.users.update({
      where: { id: userId },
      data: updateData,
    });

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

    const kycLevel = this.computeKycLevel(doc);
    await this.prisma.users.update({
      where: { id: doc.user_id! },
      data: {
        kyc_status: dto.status,
        kyc_level: kycLevel,
      },
    });
    return { message: `KYC ${dto.status}` };
  }
}
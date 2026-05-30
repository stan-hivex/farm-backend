import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { paginationParams, paginate } from '../common/utils/pagination.util';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  async submit(userId: string, dto: {
    document_type: string; document_number?: string;
    front_image: string; back_image?: string; selfie_image?: string;
  }) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.kyc_status === 'verified') throw new BadRequestException('KYC already verified');

    const pending = await this.prisma.kyc_documents.findFirst({
      where: { user_id: userId, status: 'pending' },
    });
    if (pending) throw new BadRequestException('You already have a pending KYC submission');

    const doc = await this.prisma.kyc_documents.create({
      data: { user_id: userId, ...dto, status: 'pending' },
    });
    await this.prisma.users.update({
      where: { id: userId }, data: { kyc_status: 'pending' },
    });
    return { data: doc, message: 'KYC submitted. Review takes 1-2 business days.' };
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
        include: {
          // Correct relation name: the user who submitted this document
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
    status: 'verified' | 'rejected'; rejection_reason?: string;
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
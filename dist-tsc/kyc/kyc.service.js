"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KycService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cloudinary_service_1 = require("../common/cloudinary.service");
const notifications_service_1 = require("../notifications/notifications.service");
const pagination_util_1 = require("../common/utils/pagination.util");
let KycService = class KycService {
    constructor(prisma, notificationsService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
    }
    normalizeValue(value) {
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }
    computeKycLevel(data) {
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
        if (!hasPersonalInfo)
            return 0;
        const hasDocumentVerification = Boolean(document_type && (document_number || front_image || back_image || selfie_image));
        if (!hasDocumentVerification)
            return 1;
        const hasAddressVerification = Boolean(country && county && city && address && postal_code);
        if (!hasAddressVerification)
            return 2;
        return 3;
    }
    buildKycDocumentPayload(existing, dto, urls) {
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
            status: 'pending',
        };
    }
    async submit(userId, dto) {
        const user = await this.prisma.users.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.kyc_status === 'verified')
            throw new common_1.BadRequestException('KYC already verified');
        const existingSubmission = await this.prisma.kyc_documents.findFirst({
            where: {
                user_id: userId,
                status: { in: ['pending', 'under_review', 'additional_info_required'] },
            },
        });
        let frontUrl = null;
        let backUrl = null;
        let selfieUrl = null;
        try {
            const cloud = new cloudinary_service_1.CloudinaryService();
            if (dto.front_image)
                frontUrl = await cloud.uploadBase64(dto.front_image, 'kyc');
            if (dto.back_image)
                backUrl = await cloud.uploadBase64(dto.back_image, 'kyc');
            if (dto.selfie_image)
                selfieUrl = await cloud.uploadBase64(dto.selfie_image, 'kyc');
        }
        catch (e) {
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
            }
            else {
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
        }
        catch (err) {
            console.error('Prisma save kyc_documents failed:', err instanceof Error ? err.stack || err.message : String(err));
            throw new common_1.InternalServerErrorException('Failed to save KYC submission');
        }
        const mergedDocData = {
            ...existingSubmission,
            ...dto,
            state: dto.state ?? existingSubmission?.county,
            address: dto.address ?? existingSubmission?.physical_address,
            date_of_birth: dto.dob ?? existingSubmission?.date_of_birth,
        };
        const kycLevel = this.computeKycLevel(mergedDocData);
        const updateData = {
            kyc_status: 'pending',
            kyc_level: kycLevel,
        };
        if (dto.first_name)
            updateData.first_name = dto.first_name;
        if (dto.last_name)
            updateData.last_name = dto.last_name;
        if (dto.country)
            updateData.country = dto.country;
        if (dto.city)
            updateData.city = dto.city;
        if (dto.address)
            updateData.address = dto.address;
        await this.prisma.users.update({
            where: { id: userId },
            data: updateData,
        });
        await this.notificationsService.sendNotification(userId, {
            type: 'kyc_submitted',
            entityId: doc.id,
            title: 'KYC Submitted',
            body: 'Your KYC documents have been submitted for review. You will receive updates as we process them.',
            metadata: {
                kyc_level: kycLevel,
                kyc_id: doc.id,
            },
        }).catch((error) => console.error('KYC submission notification failed', error));
        return { data: doc, message: 'KYC submitted. Your documents will be reviewed shortly.' };
    }
    async getMyKyc(userId) {
        const docs = await this.prisma.kyc_documents.findMany({
            where: { user_id: userId }, orderBy: { created_at: 'desc' },
        });
        return { data: docs };
    }
    async getQueue(query) {
        const { skip, take, page, limit } = (0, pagination_util_1.paginationParams)(query.page, query.limit);
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
                    first_name: true,
                    last_name: true,
                    date_of_birth: true,
                    gender: true,
                    nationality: true,
                    phone: true,
                    email: true,
                    country: true,
                    county: true,
                    city: true,
                    physical_address: true,
                    postal_code: true,
                    status: true,
                    reviewed_by: true,
                    rejection_reason: true,
                    reviewed_at: true,
                    users_kyc_documents_user_idTousers: {
                        select: { id: true, username: true, first_name: true, last_name: true, email: true, phone: true },
                    },
                },
            }),
            this.prisma.kyc_documents.count({ where: { status: 'pending' } }),
        ]);
        return { data: items, meta: (0, pagination_util_1.paginate)(total, page, limit) };
    }
    async review(docId, reviewerId, dto) {
        const doc = await this.prisma.kyc_documents.findUnique({ where: { id: docId } });
        if (!doc)
            throw new common_1.NotFoundException('KYC document not found');
        if (doc.status !== 'pending')
            throw new common_1.BadRequestException('Document already reviewed');
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
            where: { id: doc.user_id },
            data: {
                kyc_status: dto.status,
                kyc_level: kycLevel,
            },
        });
        const notificationMap = {
            'under_review': {
                title: 'KYC Under Review',
                body: 'Your KYC documents are now being reviewed by our team.',
            },
            'verified': {
                title: 'KYC Verified',
                body: 'Congratulations! Your KYC has been verified successfully.',
            },
            'rejected': {
                title: 'KYC Rejected',
                body: `Your KYC was rejected. Reason: ${dto.rejection_reason || 'Please contact support for more information.'}`,
            },
            'additional_info_required': {
                title: 'Additional Information Required',
                body: `We need more information to complete your KYC. Reason: ${dto.rejection_reason || 'Please provide the requested documents.'}`,
            },
        };
        const notifData = notificationMap[dto.status] || notificationMap['under_review'];
        await this.notificationsService.sendNotification(doc.user_id, {
            type: `kyc_${dto.status}`,
            entityId: doc.id,
            title: notifData.title,
            body: notifData.body,
            metadata: {
                kyc_id: doc.id,
                kyc_status: dto.status,
                reviewed_by: reviewerId,
            },
        }).catch((error) => console.error('KYC review notification failed', error));
        return { message: `KYC ${dto.status}` };
    }
};
exports.KycService = KycService;
exports.KycService = KycService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService])
], KycService);
//# sourceMappingURL=kyc.service.js.map
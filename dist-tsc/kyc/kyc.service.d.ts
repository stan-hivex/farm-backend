import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class KycService {
    private prisma;
    private notificationsService;
    constructor(prisma: PrismaService, notificationsService: NotificationsService);
    private normalizeValue;
    private computeKycLevel;
    private buildKycDocumentPayload;
    submit(userId: string, dto: {
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
    }): Promise<{
        data: any;
        message: string;
    }>;
    getMyKyc(userId: string): Promise<{
        data: {
            id: string;
            email: string | null;
            phone: string | null;
            first_name: string | null;
            last_name: string | null;
            country: string | null;
            city: string | null;
            created_at: Date | null;
            status: import("@prisma/client").$Enums.kyc_status | null;
            user_id: string | null;
            document_type: string | null;
            front_image: string | null;
            back_image: string | null;
            selfie_image: string | null;
            document_number: string | null;
            reviewed_by: string | null;
            rejection_reason: string | null;
            reviewed_at: Date | null;
            address_document: string | null;
            back_image_url: string | null;
            county: string | null;
            date_of_birth: Date | null;
            front_image_url: string | null;
            gender: string | null;
            nationality: string | null;
            physical_address: string | null;
            postal_code: string | null;
            selfie_image_url: string | null;
        }[];
    }>;
    getQueue(query: any): Promise<{
        data: {
            id: string;
            email: string | null;
            phone: string | null;
            first_name: string | null;
            last_name: string | null;
            country: string | null;
            city: string | null;
            created_at: Date | null;
            status: import("@prisma/client").$Enums.kyc_status | null;
            user_id: string | null;
            document_type: string | null;
            front_image: string | null;
            back_image: string | null;
            selfie_image: string | null;
            document_number: string | null;
            reviewed_by: string | null;
            rejection_reason: string | null;
            reviewed_at: Date | null;
            county: string | null;
            date_of_birth: Date | null;
            gender: string | null;
            nationality: string | null;
            physical_address: string | null;
            postal_code: string | null;
            users_kyc_documents_user_idTousers: {
                id: string;
                username: string;
                email: string | null;
                phone: string;
                first_name: string;
                last_name: string;
            } | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    review(docId: string, reviewerId: string, dto: {
        status: 'under_review' | 'verified' | 'rejected' | 'additional_info_required';
        rejection_reason?: string;
    }): Promise<{
        message: string;
    }>;
}

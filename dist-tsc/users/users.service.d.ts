import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
export declare class UsersService {
    private prisma;
    private cache;
    constructor(prisma: PrismaService, cache: CacheService);
    getProfile(userId: string): Promise<any>;
    updateProfile(userId: string, dto: {
        first_name?: string;
        last_name?: string;
        username?: string;
        bio?: string;
        country?: string;
        city?: string;
    }): Promise<{
        data: {
            id: string;
            username: string;
            first_name: string;
            last_name: string;
            profile_image: string | null;
            bio: string | null;
            country: string | null;
            city: string | null;
        };
        message: string;
    }>;
    searchUsers(query: string): Promise<{
        data: {
            id: string;
            username: string;
            phone: string;
            first_name: string;
            last_name: string;
            profile_image: string | null;
            wallets: {
                wallet_address: string;
            }[];
        }[];
    }>;
    getContacts(userId: string): Promise<{
        data: ({
            users_contacts_contact_user_idTousers: {
                id: string;
                username: string;
                first_name: string;
                last_name: string;
                profile_image: string | null;
                wallets: {
                    wallet_address: string;
                }[];
            } | null;
        } & {
            id: string;
            created_at: Date | null;
            owner_id: string | null;
            contact_user_id: string | null;
            nickname: string | null;
        })[];
    }>;
    addContact(ownerId: string, identifier: string, nickname?: string): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            owner_id: string | null;
            contact_user_id: string | null;
            nickname: string | null;
        };
        message: string;
    }>;
    removeContact(ownerId: string, contactId: string): Promise<{
        message: string;
    }>;
    getNotifications(userId: string, query: any): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            user_id: string | null;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            type: import("@prisma/client").$Enums.notification_type | null;
            title: string | null;
            body: string | null;
            is_read: boolean | null;
        }[];
        meta: import("../common/utils/pagination.util").PaginationMeta;
    }>;
    markNotificationRead(userId: string, notifId: string): Promise<{
        message: string;
    }>;
    markAllNotificationsRead(userId: string): Promise<{
        message: string;
    }>;
    deleteNotification(userId: string, notifId: string): Promise<{
        message: string;
    }>;
    deleteAllNotifications(userId: string): Promise<{
        message: string;
        deletedCount: number;
    }>;
    changeEmail(userId: string, dto: {
        new_email: string;
        current_password: string;
    }): Promise<{
        data: {
            id: string;
            email: string | null;
            email_verified: boolean | null;
        };
        message: string;
    }>;
    changePhone(userId: string, dto: {
        new_phone: string;
        current_password: string;
    }): Promise<{
        data: {
            id: string;
            phone: string;
            phone_verified: boolean | null;
        };
        message: string;
    }>;
}

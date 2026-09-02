import { UsersService } from './users.service';
declare class UpdateProfileDto {
    first_name?: string;
    last_name?: string;
    username?: string;
    bio?: string;
    country?: string;
    city?: string;
}
declare class ChangeEmailDto {
    new_email: string;
    current_password: string;
}
declare class ChangePhoneDto {
    new_phone: string;
    current_password: string;
}
declare class AddContactDto {
    identifier: string;
    nickname?: string;
}
export declare class UsersController {
    private readonly svc;
    constructor(svc: UsersService);
    getMe(u: any): Promise<any>;
    updateMe(u: any, dto: UpdateProfileDto): Promise<{
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
    changeEmail(u: any, dto: ChangeEmailDto): Promise<{
        data: {
            id: string;
            email: string | null;
            email_verified: boolean | null;
        };
        message: string;
    }>;
    changePhone(u: any, dto: ChangePhoneDto): Promise<{
        data: {
            id: string;
            phone: string;
            phone_verified: boolean | null;
        };
        message: string;
    }>;
    search(q: string): Promise<{
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
    contacts(u: any): Promise<{
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
    addContact(u: any, dto: AddContactDto): Promise<{
        data: {
            id: string;
            created_at: Date | null;
            owner_id: string | null;
            contact_user_id: string | null;
            nickname: string | null;
        };
        message: string;
    }>;
    removeContact(u: any, id: string): Promise<{
        message: string;
    }>;
    notifications(u: any, q: any): Promise<{
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
    markRead(u: any, id: string): Promise<{
        message: string;
    }>;
    markAllRead(u: any): Promise<{
        message: string;
    }>;
    deleteNotification(u: any, id: string): Promise<{
        message: string;
    }>;
    deleteAllNotifications(u: any): Promise<{
        message: string;
        deletedCount: number;
    }>;
}
export {};

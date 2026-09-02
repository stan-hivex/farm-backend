export declare enum UserRole {
    USER = "user",
    MERCHANT = "merchant",
    ADMIN = "admin",
    SUPER_ADMIN = "super_admin"
}
export declare enum KycStatus {
    NONE = "none",
    PENDING = "pending",
    UNDER_REVIEW = "under_review",
    VERIFIED = "verified",
    REJECTED = "rejected",
    ADDITIONAL_INFO_REQUIRED = "additional_info_required"
}
export declare enum TransactionType {
    DEPOSIT = "deposit",
    WITHDRAWAL = "withdrawal",
    TRANSFER = "transfer",
    MERCHANT_PAYMENT = "merchant_payment",
    ESCROW_LOCK = "escrow_lock",
    ESCROW_RELEASE = "escrow_release",
    ESCROW_REFUND = "escrow_refund",
    INVESTMENT = "investment",
    ROI_PAYOUT = "roi_payout",
    FEE = "fee",
    CONVERSION = "conversion",
    CROSS_BORDER = "cross_border"
}
export declare enum TransactionStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
    REVERSED = "reversed"
}
export declare enum EscrowStatus {
    PENDING = "pending",
    ACTIVE = "active",
    COMPLETED = "completed",
    DISPUTED = "disputed",
    CANCELLED = "cancelled",
    REFUNDED = "refunded"
}
export declare enum MerchantStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    SUSPENDED = "suspended"
}
export declare enum WalletType {
    USER = "user",
    MERCHANT = "merchant",
    TREASURY = "treasury",
    OPERATIONS = "operations",
    CREATOR = "creator"
}
export declare enum NotificationType {
    SYSTEM = "system",
    TRANSACTION = "transaction",
    SECURITY = "security",
    ESCROW = "escrow",
    INVESTMENT = "investment",
    MERCHANT = "merchant"
}

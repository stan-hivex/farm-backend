"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = exports.WalletType = exports.MerchantStatus = exports.EscrowStatus = exports.TransactionStatus = exports.TransactionType = exports.KycStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["USER"] = "user";
    UserRole["MERCHANT"] = "merchant";
    UserRole["ADMIN"] = "admin";
    UserRole["SUPER_ADMIN"] = "super_admin";
})(UserRole || (exports.UserRole = UserRole = {}));
var KycStatus;
(function (KycStatus) {
    KycStatus["NONE"] = "none";
    KycStatus["PENDING"] = "pending";
    KycStatus["UNDER_REVIEW"] = "under_review";
    KycStatus["VERIFIED"] = "verified";
    KycStatus["REJECTED"] = "rejected";
    KycStatus["ADDITIONAL_INFO_REQUIRED"] = "additional_info_required";
})(KycStatus || (exports.KycStatus = KycStatus = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["DEPOSIT"] = "deposit";
    TransactionType["WITHDRAWAL"] = "withdrawal";
    TransactionType["TRANSFER"] = "transfer";
    TransactionType["MERCHANT_PAYMENT"] = "merchant_payment";
    TransactionType["ESCROW_LOCK"] = "escrow_lock";
    TransactionType["ESCROW_RELEASE"] = "escrow_release";
    TransactionType["ESCROW_REFUND"] = "escrow_refund";
    TransactionType["INVESTMENT"] = "investment";
    TransactionType["ROI_PAYOUT"] = "roi_payout";
    TransactionType["FEE"] = "fee";
    TransactionType["CONVERSION"] = "conversion";
    TransactionType["CROSS_BORDER"] = "cross_border";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["PROCESSING"] = "processing";
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["FAILED"] = "failed";
    TransactionStatus["CANCELLED"] = "cancelled";
    TransactionStatus["REVERSED"] = "reversed";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var EscrowStatus;
(function (EscrowStatus) {
    EscrowStatus["PENDING"] = "pending";
    EscrowStatus["ACTIVE"] = "active";
    EscrowStatus["COMPLETED"] = "completed";
    EscrowStatus["DISPUTED"] = "disputed";
    EscrowStatus["CANCELLED"] = "cancelled";
    EscrowStatus["REFUNDED"] = "refunded";
})(EscrowStatus || (exports.EscrowStatus = EscrowStatus = {}));
var MerchantStatus;
(function (MerchantStatus) {
    MerchantStatus["PENDING"] = "pending";
    MerchantStatus["APPROVED"] = "approved";
    MerchantStatus["REJECTED"] = "rejected";
    MerchantStatus["SUSPENDED"] = "suspended";
})(MerchantStatus || (exports.MerchantStatus = MerchantStatus = {}));
var WalletType;
(function (WalletType) {
    WalletType["USER"] = "user";
    WalletType["MERCHANT"] = "merchant";
    WalletType["TREASURY"] = "treasury";
    WalletType["OPERATIONS"] = "operations";
    WalletType["CREATOR"] = "creator";
})(WalletType || (exports.WalletType = WalletType = {}));
var NotificationType;
(function (NotificationType) {
    NotificationType["SYSTEM"] = "system";
    NotificationType["TRANSACTION"] = "transaction";
    NotificationType["SECURITY"] = "security";
    NotificationType["ESCROW"] = "escrow";
    NotificationType["INVESTMENT"] = "investment";
    NotificationType["MERCHANT"] = "merchant";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
//# sourceMappingURL=index.js.map
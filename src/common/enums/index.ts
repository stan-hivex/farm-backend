export enum UserRole {
  USER = 'user',
  MERCHANT = 'merchant',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum KycStatus {
  NONE = 'none',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  MERCHANT_PAYMENT = 'merchant_payment',
  ESCROW_LOCK = 'escrow_lock',
  ESCROW_RELEASE = 'escrow_release',
  ESCROW_REFUND = 'escrow_refund',
  INVESTMENT = 'investment',
  ROI_PAYOUT = 'roi_payout',
  FEE = 'fee',
  CONVERSION = 'conversion',
  CROSS_BORDER = 'cross_border',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed',
}

export enum EscrowStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum MerchantStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

export enum WalletType {
  USER = 'user',
  MERCHANT = 'merchant',
  TREASURY = 'treasury',
  OPERATIONS = 'operations',
  CREATOR = 'creator',
}

export enum NotificationType {
  SYSTEM = 'system',
  TRANSACTION = 'transaction',
  SECURITY = 'security',
  ESCROW = 'escrow',
  INVESTMENT = 'investment',
  MERCHANT = 'merchant',
}
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'escrow_created';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'escrow_received';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'escrow_disputed';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'escrow_released';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'escrow_refunded';

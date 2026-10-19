import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Prisma, payment_receipts } from '@prisma/client';
import type { Queue } from 'bull';
import { getStorage } from 'firebase-admin/storage';
import { paginationParams, paginate } from '../common/utils/pagination.util';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('payment-receipts')
    private readonly receiptQueue: Queue,
  ) {}

  async createForTransaction(
    tx: Prisma.TransactionClient,
    transactionId: string,
    merchantId: string,
    amount: Prisma.Decimal | number,
    createdAt = new Date(),
    fee: Prisma.Decimal | number = 0,
  ): Promise<payment_receipts> {
    const receiptNumber = `FARM-${createdAt.getUTCFullYear()}-${transactionId.toUpperCase()}`;
    return tx.payment_receipts.create({
      data: {
        receipt_number: receiptNumber,
        transaction_id: transactionId,
        merchant_id: merchantId,
        amount,
        fee,
        created_at: createdAt,
      },
    });
  }

  enqueuePdfAndEmail(receiptId: string): void {
    void this.receiptQueue
      .add(
        'generate-pdf',
        { receiptId },
        {
          jobId: `receipt-pdf-${receiptId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not queue PDF generation for receipt ${receiptId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  async listForMerchantOwner(userId: string, query: any) {
    const merchant = await this.prisma.merchants.findFirst({
      where: { user_id: userId },
      select: { id: true },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant account was not found');
    }

    const { skip, take, page, limit } = paginationParams(
      query.page,
      query.limit,
    );
    const where = { merchant_id: merchant.id };
    const [items, total] = await Promise.all([
      this.prisma.payment_receipts.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          transactions: {
            select: {
              transaction_reference: true,
              status: true,
              currency: true,
              metadata: true,
            },
          },
          merchants: { select: { business_name: true } },
        },
      }),
      this.prisma.payment_receipts.count({ where }),
    ]);

    return {
      data: items.map((receipt) => this.toResponse(receipt)),
      meta: paginate(total, page, limit),
    };
  }

  async getForMerchantOwner(userId: string, receiptId: string) {
    const receipt = await this.findOwnedReceipt(userId, receiptId);
    return { data: this.toResponse(receipt) };
  }

  async getDownloadUrlForMerchantOwner(userId: string, receiptId: string) {
    const receipt = await this.findOwnedReceipt(userId, receiptId);
    return this.createDownloadUrl(receipt.pdf_url, receipt.receipt_number);
  }

  async getPublicDownloadUrlForTransaction(transactionId: string) {
    const receipt = await this.prisma.payment_receipts.findFirst({
      where: { transaction_id: transactionId },
      select: { receipt_number: true, pdf_url: true },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return this.createDownloadUrl(receipt.pdf_url, receipt.receipt_number);
  }

  private async createDownloadUrl(
    pdfUrl: string | null,
    receiptNumber: string,
  ) {
    if (!pdfUrl) {
      throw new ServiceUnavailableException(
        'The receipt PDF is still being generated',
      );
    }

    const bucketName = this.config.get<string>('FIREBASE_STORAGE_BUCKET');
    if (!bucketName) {
      throw new ServiceUnavailableException(
        'Private receipt storage is not configured',
      );
    }

    const [url] = await getStorage()
      .bucket(bucketName)
      .file(pdfUrl)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 5 * 60 * 1000,
        responseDisposition: `attachment; filename="${receiptNumber}.pdf"`,
      });
    return { data: { url, expires_in_seconds: 300 } };
  }

  private async findOwnedReceipt(userId: string, receiptId: string) {
    const receipt = await this.prisma.payment_receipts.findFirst({
      where: {
        id: receiptId,
        merchants: { user_id: userId },
      },
      include: {
        transactions: {
          select: {
            transaction_reference: true,
            status: true,
            currency: true,
            metadata: true,
          },
        },
        merchants: { select: { business_name: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  private toResponse(receipt: any) {
    const metadata =
      receipt.transactions?.metadata &&
      typeof receipt.transactions.metadata === 'object'
        ? (receipt.transactions.metadata as Record<string, unknown>)
        : {};
    return {
      id: receipt.id,
      receipt_number: receipt.receipt_number,
      transaction_id: receipt.transaction_id,
      transaction_reference: receipt.transactions?.transaction_reference,
      merchant_id: receipt.merchant_id,
      merchant_name: receipt.merchants?.business_name ?? 'Merchant',
      payer_email:
        typeof metadata.guest_email === 'string' ? metadata.guest_email : null,
      amount: Number(receipt.amount),
      fee: Number(receipt.fee),
      currency: receipt.transactions?.currency ?? 'FARM',
      status: receipt.transactions?.status ?? 'completed',
      pdf_available: Boolean(receipt.pdf_url),
      created_at: receipt.created_at,
    };
  }
}

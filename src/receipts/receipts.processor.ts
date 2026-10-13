import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bull';
import { getStorage } from 'firebase-admin/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../database/prisma.service';

@Processor('payment-receipts')
export class ReceiptsProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    @InjectQueue('payment-receipts')
    private readonly receiptQueue: Queue,
  ) {}

  @Process('generate-pdf')
  async generatePdf(job: Job<{ receiptId: string }>) {
    const receipt = await this.prisma.payment_receipts.findUnique({
      where: { id: job.data.receiptId },
      include: {
        transactions: { select: { transaction_reference: true } },
        merchants: {
          include: {
            users_merchants_user_idTousers: { select: { email: true } },
          },
        },
      },
    });
    if (!receipt) throw new Error(`Receipt ${job.data.receiptId} was not found`);
    if (!receipt.pdf_url) {
      const bucketName = this.config.get<string>('FIREBASE_STORAGE_BUCKET');
      if (!bucketName) {
        throw new Error('FIREBASE_STORAGE_BUCKET is not configured');
      }

      const pdfBytes = await this.createPdf(receipt);
      const objectPath =
        `receipts/${receipt.merchant_id}/${receipt.receipt_number}.pdf`;
      await getStorage()
        .bucket(bucketName)
        .file(objectPath)
        .save(Buffer.from(pdfBytes), {
          resumable: false,
          metadata: {
            contentType: 'application/pdf',
            cacheControl: 'private, no-store',
          },
        });
      await this.prisma.payment_receipts.update({
        where: { id: receipt.id },
        data: { pdf_url: objectPath },
      });
    }

    await this.receiptQueue.add(
      'send-email',
      { receiptId: receipt.id },
      {
        jobId: `receipt-email-${receipt.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  @Process('send-email')
  async sendEmail(job: Job<{ receiptId: string }>) {
    const receipt = await this.prisma.payment_receipts.findUnique({
      where: { id: job.data.receiptId },
      include: {
        transactions: { select: { transaction_reference: true } },
        merchants: {
          include: {
            users_merchants_user_idTousers: { select: { email: true } },
          },
        },
      },
    });
    if (!receipt) throw new Error(`Receipt ${job.data.receiptId} was not found`);
    if (receipt.email_sent_at || !receipt.pdf_url) return;

    const email =
      receipt.merchants.business_email?.trim() ||
      receipt.merchants.users_merchants_user_idTousers?.email?.trim();
    if (!email) {
      throw new Error(`No merchant email is configured for receipt ${receipt.id}`);
    }
    const bucketName = this.config.get<string>('FIREBASE_STORAGE_BUCKET');
    if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET is not configured');
    const [pdfBuffer] = await getStorage()
      .bucket(bucketName)
      .file(receipt.pdf_url)
      .download();

    await this.notifications.sendReceiptEmailOrThrow({
      to: email,
      receiptNumber: receipt.receipt_number,
      amount: Number(receipt.amount),
      currency: 'FARM',
      pdfBase64: pdfBuffer.toString('base64'),
    });
    await this.prisma.payment_receipts.update({
      where: { id: receipt.id },
      data: { email_sent_at: new Date() },
    });
  }

  private async createPdf(receipt: any) {
    const document = await PDFDocument.create();
    const page = document.addPage([595.28, 841.89]);
    const regularFont = await document.embedFont(StandardFonts.Helvetica);
    const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
    const left = 52;
    const green = rgb(0.06, 0.39, 0.25);
    const details = [
      ['Receipt number', receipt.receipt_number],
      ['Date', receipt.created_at.toISOString()],
      ['Merchant', receipt.merchants.business_name],
      ['Amount', `${Number(receipt.amount).toFixed(2)} FARM`],
      ['Fee', `${Number(receipt.fee).toFixed(2)} FARM`],
      ['Transaction reference', receipt.transactions.transaction_reference],
    ];

    page.drawText('FARM', {
      x: left,
      y: 770,
      size: 30,
      font: boldFont,
      color: green,
    });
    page.drawText('PAYMENT RECEIPT', {
      x: left,
      y: 730,
      size: 16,
      font: boldFont,
      color: rgb(0.12, 0.15, 0.14),
    });
    let y = 675;
    for (const [label, value] of details) {
      page.drawText(label, {
        x: left,
        y,
        size: 11,
        font: boldFont,
        color: rgb(0.36, 0.39, 0.37),
      });
      page.drawText(String(value), {
        x: left + 160,
        y,
        size: 11,
        font: regularFont,
        color: rgb(0.12, 0.15, 0.14),
        maxWidth: 330,
      });
      y -= 34;
    }
    page.drawText('Thank you for using FARM.', {
      x: left,
      y: y - 20,
      size: 12,
      font: boldFont,
      color: green,
    });
    return document.save();
  }
}

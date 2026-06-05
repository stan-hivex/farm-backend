
import { Injectable, Logger } from '@nestjs/common';

/**
 * DEPRECATED: This service is NO LONGER USED.
 * Wallet credit must ONLY happen in WebhookService.handlePaystackWebhookProcessing().
 *
 * All deposit finalization and wallet credit operations have been consolidated
 * into WebhookService to ensure:
 * - HMAC-SHA512 signature verification on all webhooks
 * - Amount validation (kobo vs fiat conversion)
 * - Fraud detection and anti-fraud checks
 * - Proper state machine transitions (pending → completed)
 * - Idempotent processing (using Redis locks)
 *
 * @deprecated Use WebhookService.finalizeDeposit() instead
 */
@Injectable()
export class PaymentProcessorService {
	private readonly logger = new Logger(PaymentProcessorService.name);

	constructor() {
		this.logger.warn(
			'PaymentProcessorService instantiated but is DEPRECATED. ' +
			'All wallet credit operations must use WebhookService.finalizeDeposit().',
		);
	}

	/**
	 * DEPRECATED: This method should never be called.
	 * Wallet credit must ONLY happen in WebhookService.handlePaystackWebhookProcessing().
	 *
	 * @throws Error Always throws to prevent accidental use
	 * @deprecated Use WebhookService.finalizeDeposit() instead
	 */
	async processDeposit(reference: string): Promise<void> {
		this.logger.error(
			`PaymentProcessorService.processDeposit() was called for ${reference} — this method is DEPRECATED. ` +
			'All wallet credit must happen in WebhookService.handlePaystackWebhookProcessing() ' +
			'to ensure HMAC signature verification, amount validation, and fraud detection.',
		);
		throw new Error(
			'PaymentProcessorService.processDeposit() is deprecated. Use WebhookService.finalizeDeposit() instead.',
		);
	}
}


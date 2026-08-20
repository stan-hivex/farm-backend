import { forwardRef, Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { WebhookModule } from '../webhook/webhook.module';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { PaystackModule } from '../paystack/paystack.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { KycGuard } from '../common/guards/kyc.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		WebsocketModule,
		forwardRef(() => WebhookModule),
		IvorypayModule,
		AuthModule,
		forwardRef(() => PaystackModule),
		forwardRef(() => WithdrawModule),
	],
	controllers: [PaymentsController, PaymentsWebhookController],
	providers: [PaymentsService, KycGuard],
	exports: [PaymentsService],
})
export class PaymentsModule {}
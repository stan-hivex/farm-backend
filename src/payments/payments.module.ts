import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProcessorService } from './payment-processor.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { PaystackModule } from '../paystack/paystack.module';
import { WithdrawModule } from '../withdraw/withdraw.module';
import { KycGuard } from '../common/guards/kyc.guard';

@Module({
	imports: [WebsocketModule, IvorypayModule, PaystackModule, WithdrawModule],
	controllers: [PaymentsController],
	providers: [PaymentsService, PaymentProcessorService, KycGuard],
	exports: [PaymentsService, PaymentProcessorService],
})
export class PaymentsModule {}
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProcessorService } from './payment-processor.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { IvorypayModule } from '../ivorypay/ivorypay.module';
import { PaystackModule } from '../paystack/paystack.module';

@Module({
	imports: [WebsocketModule, IvorypayModule, PaystackModule],
	controllers: [PaymentsController],
	providers: [PaymentsService, PaymentProcessorService],
	exports: [PaymentsService, PaymentProcessorService],
})
export class PaymentsModule {}
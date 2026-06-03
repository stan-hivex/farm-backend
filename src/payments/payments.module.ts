import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProcessorService } from './payment-processor.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
	imports: [WebsocketModule],
	controllers: [PaymentsController],
	providers: [PaymentsService, PaymentProcessorService],
	exports: [PaymentsService, PaymentProcessorService],
})
export class PaymentsModule {}
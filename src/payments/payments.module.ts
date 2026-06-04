import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProcessorService } from './payment-processor.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { StkPushModule } from '../stk/stk.module';

@Module({
	imports: [WebsocketModule, StkPushModule],
	controllers: [PaymentsController],
	providers: [PaymentsService, PaymentProcessorService],
	exports: [PaymentsService, PaymentProcessorService],
})
export class PaymentsModule {}
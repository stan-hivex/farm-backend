import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { TravelModule } from '../travel/travel.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AiProvider } from './ai-provider';
import { AiToolsService } from './ai-tools.service';

@Module({ imports: [WalletsModule, TravelModule], controllers: [AiAssistantController], providers: [AiAssistantService, AiProvider, AiToolsService] })
export class AiAssistantModule {}

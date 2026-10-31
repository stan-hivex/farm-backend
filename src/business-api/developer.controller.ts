import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiKeysService } from './api-keys.service';
import { DeveloperService } from './developer.service';
import {
  CreateApiKeyDto,
  KeyPinDto,
  UpdateWebhookDto,
  WebhookEndpointDto,
} from './business-api.dto';

/** App-facing developer dashboard (JWT). Owner, Admin and Developer roles only. */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({ path: 'business/developer', version: '1' })
export class DeveloperController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly dev: DeveloperService,
  ) {}

  @Get('meta') meta(@CurrentUser() u: any) {
    return this.dev.meta(u.id);
  }
  @Get('overview') overview(
    @CurrentUser() u: any,
    @Query('mode') mode: string,
  ) {
    return this.dev.overview(u.id, mode);
  }

  @Get('keys') listKeys(@CurrentUser() u: any, @Query('mode') mode?: string) {
    return this.keys.list(u.id, mode);
  }
  @Post('keys')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createKey(@CurrentUser() u: any, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(u.id, dto);
  }
  @Get('keys/:id/reveal')
  reveal(@CurrentUser() u: any, @Param('id') id: string) {
    return this.keys.reveal(u.id, id);
  }
  @Post('keys/:id/rotate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  rotate(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() dto: KeyPinDto,
  ) {
    return this.keys.rotate(u.id, id, dto.pin);
  }
  @Post('keys/:id/revoke')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  revoke(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() dto: KeyPinDto,
  ) {
    return this.keys.revoke(u.id, id, dto.pin);
  }

  @Get('webhooks') endpoints(
    @CurrentUser() u: any,
    @Query('mode') mode?: string,
  ) {
    return this.dev.listEndpoints(u.id, mode);
  }
  @Post('webhooks') createEndpoint(
    @CurrentUser() u: any,
    @Body() dto: WebhookEndpointDto,
  ) {
    return this.dev.createEndpoint(u.id, dto);
  }
  @Patch('webhooks/:id') updateEndpoint(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.dev.updateEndpoint(u.id, id, dto);
  }
  @Post('webhooks/:id/roll-secret') rollSecret(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KeyPinDto,
  ) {
    return this.dev.rollSecret(u.id, id, dto.pin);
  }
  @Post('webhooks/:id/delete') deleteEndpoint(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KeyPinDto,
  ) {
    return this.dev.deleteEndpoint(u.id, id, dto.pin);
  }
  @Post('webhooks/:id/test')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.dev.testEndpoint(u.id, id);
  }
  @Get('webhooks/:id/deliveries') deliveries(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: any,
  ) {
    return this.dev.deliveries(u.id, id, q);
  }
  @Post('deliveries/:id/retry') retry(
    @CurrentUser() u: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dev.retryDelivery(u.id, id);
  }

  @Get('requests') requests(@CurrentUser() u: any, @Query() q: any) {
    return this.dev.requests(u.id, q);
  }
  @Get('usage') usage(
    @CurrentUser() u: any,
    @Query('range') range = '7d',
    @Query('mode') mode = 'sandbox',
  ) {
    return this.dev.usage(u.id, range, mode);
  }
}

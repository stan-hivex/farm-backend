import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { DiditService } from './didit.service';

type RequestWithRawBody = Request & { rawBody?: string };

@Controller({
  path: 'webhooks/didit',
  version: VERSION_NEUTRAL,
})
export class DiditWebhookController {
  constructor(private readonly diditService: DiditService) {}

  @Post()
  @HttpCode(200)
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async receive(
    @Req() request: RequestWithRawBody,
  ): Promise<{ status: string }> {
    if (!request.rawBody) {
      throw new UnauthorizedException('Webhook body is unavailable');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(request.rawBody);
    } catch {
      throw new BadRequestException('Invalid webhook JSON');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('Invalid webhook payload');
    }

    await this.diditService.processWebhook(
      payload as Record<string, unknown>,
      request.header('x-signature-v2') ?? '',
    );
    return { status: 'ok' };
  }
}

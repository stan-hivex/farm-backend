import { All, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { X402Service } from './x402.service';

const PRICE = /^\d+(\.\d{1,6})?$/;
export class ResourceBody {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @Length(0, 255) description?: string;
  @IsOptional() @IsIn(['GET', 'POST', 'ANY']) method?: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) upstream_url!: string;
  @IsOptional() @IsString() @Length(1, 100) mime_type?: string;
  @IsIn(['FARM', 'USDC']) asset!: string;
  @IsString() @Matches(PRICE) price!: string;
}
export class ResourcePatch {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @Length(0, 255) description?: string;
  @IsOptional() @IsIn(['active', 'paused']) status?: string;
  @IsOptional() @IsString() @Matches(PRICE) price?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) upstream_url?: string;
}

@ApiTags('x402')
@Controller({ path: 'x402', version: '1' })
export class X402PublicController {
  constructor(private readonly svc: X402Service) {}
  @Get('status') status() {
    return this.svc.status();
  }
  @Get('supported') supported() {
    return this.svc.supported();
  }

  /** Public paid endpoint: 402 + PAYMENT-REQUIRED, or verify -> service -> settle. */
  @All('r/:id') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async gateway(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1) : '';
    const out: any = await this.svc.gateway(id, {
      method: req.method.toUpperCase(),
      url: `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`,
      query: q,
      headers: req.headers as any,
      body: req.body,
    });
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
    for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v as string);
    res.status(out.status);
    if (out.raw !== undefined) {
      if (out.contentType) res.type(out.contentType);
      return res.send(out.raw);
    }
    return res.json(out.json);
  }
}

@ApiTags('Business - x402')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'business/x402', version: '1' })
export class BusinessX402Controller {
  constructor(private readonly svc: X402Service) {}
  @Get('resources') async list(@CurrentUser() u: any) {
    return { data: await this.svc.listResources(u.id) };
  }
  @Post('resources') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() u: any, @Body() b: ResourceBody) {
    return this.svc.createResource(u.id, b);
  }
  @Get('resources/:id') get(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getResource(u.id, id);
  }
  @Patch('resources/:id') update(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string, @Body() b: ResourcePatch) {
    return this.svc.updateResource(u.id, id, b);
  }
  @Get('payments') async payments(@CurrentUser() u: any, @Query('resource_id') rid?: string) {
    return { data: await this.svc.payments(u.id, rid) };
  }
}

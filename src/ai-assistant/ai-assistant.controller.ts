import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiAssistantService } from './ai-assistant.service';

class ChatDto {
  @IsNotEmpty() @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsUUID() conversation_id?: string;
}
class PermissionsDto {
  @IsBoolean() enabled!: boolean;
  @IsNumber() @Min(0) per_tx_cap!: number;
  @IsNumber() @Min(0) daily_cap!: number;
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) allowed_actions!: string[];
}
class ConfirmDto {
  @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
}

@ApiTags('AI Assistant')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'ai', version: '1' })
export class AiAssistantController {
  constructor(private readonly svc: AiAssistantService) {}

  @Get('status') status() { return this.svc.status(); }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('chat') @ApiOperation({ summary: 'Send a message to Mkulima' })
  chat(@CurrentUser() u: any, @Body() dto: ChatDto) { return this.svc.chat(u.id, dto.message, dto.conversation_id); }

  @Get('conversations') async list(@CurrentUser() u: any) { return { data: await this.svc.listConversations(u.id) }; }
  @Get('conversations/:id') get(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getConversation(u.id, id); }
  @Delete('conversations/:id') del(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteConversation(u.id, id); }

  @Get('permissions') perms(@CurrentUser() u: any) { return this.svc.getPermissions(u.id); }
  @Put('permissions') setPerms(@CurrentUser() u: any, @Body() dto: PermissionsDto) { return this.svc.updatePermissions(u.id, dto); }
  @Post('permissions/revoke') revoke(@CurrentUser() u: any) { return this.svc.revokePermissions(u.id); }

  @Get('actions') async actions(@CurrentUser() u: any, @Query('status') status?: string) { return { data: await this.svc.listActions(u.id, status) }; }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('actions/:id/confirm') confirm(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto, @Req() req: Request) {
    return this.svc.confirmAction(u.id, id, dto.pin, req.ip || '');
  }
  @Post('actions/:id/reject') reject(@CurrentUser() u: any, @Param('id', ParseUUIDPipe) id: string) { return this.svc.rejectAction(u.id, id); }

  @Get('audit') async audit(@CurrentUser() u: any) { return { data: await this.svc.auditLog(u.id) }; }
}

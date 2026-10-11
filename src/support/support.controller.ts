import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums';
import { SupportService } from './support.service';

const SUPPORT_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
];

class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(28_000_000)
  attachmentBase64?: string;

  @IsOptional()
  @IsIn(SUPPORT_ATTACHMENT_MIME_TYPES)
  attachmentMimeType?: string;
}

class ReplyToSupportTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(28_000_000)
  attachmentBase64?: string;

  @IsOptional()
  @IsIn(SUPPORT_ATTACHMENT_MIME_TYPES)
  attachmentMimeType?: string;
}

@UseGuards(JwtGuard)
@Controller({ path: 'support/tickets', version: '1' })
export class UserSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @Permissions('profile:write')
  createTicket(
    @CurrentUser() user: any,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(
      user.id,
      dto.subject,
      dto.message ?? '',
      dto,
    );
  }

  @Get()
  @Permissions('profile:read')
  listMyTickets(@CurrentUser() user: any) {
    return this.supportService.listUserTickets(user.id);
  }

  @Post(':id/reply')
  @Permissions('profile:write')
  reply(
    @Param('id') ticketId: string,
    @CurrentUser() user: any,
    @Body() dto: ReplyToSupportTicketDto,
  ) {
    return this.supportService.replyToTicketAsUser(
      ticketId,
      user.id,
      dto.message ?? '',
      dto,
    );
  }
}

@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller({ path: 'admin/support/tickets', version: '1' })
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @Permissions('admin:read')
  listTickets(@Query('status') status?: string) {
    return this.supportService.listAdminTickets(status);
  }

  @Post(':id/reply')
  @Permissions('admin:write')
  reply(
    @Param('id') ticketId: string,
    @CurrentUser() user: any,
    @Body() dto: ReplyToSupportTicketDto,
  ) {
    return this.supportService.replyToTicketAsAdmin(
      ticketId,
      user.id,
      dto.message ?? '',
      dto,
    );
  }
}

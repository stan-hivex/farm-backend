import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';
import { InvestmentsService } from './investments.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';

class InvestDto {
  @IsNumber() @IsPositive() amount!: number;
  @IsNotEmpty() @IsString() @Length(4, 6) pin!: string;
  @IsOptional() @IsBoolean() accept_risk?: boolean;
  @IsOptional() @IsString() @Length(1, 20) disclosure_version?: string;
}

@ApiTags('Investments')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard, RolesGuard)
@Controller({ path: 'investments', version: '1' })
export class InvestmentsController {
  constructor(private readonly svc: InvestmentsService) {}

  @Permissions('investments:read')
  @Get()
  @ApiOperation({ summary: 'Browse investment projects' })
  list(@Query() q: any) {
    return this.svc.listProjects(q);
  }

  @Permissions('investments:read')
  @Get('my')
  @ApiOperation({ summary: 'My investment portfolio' })
  mine(@CurrentUser() u: any, @Query() q: any) {
    return this.svc.getMyInvestments(u.id, q);
  }

  @Permissions('investments:read')
  @Get(':id')
  @ApiOperation({ summary: 'Get project detail' })
  get(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.getProject(id, u?.id);
  }

  @Permissions('investments:write')
  @Post(':id/invest')
  @ApiOperation({ summary: 'Invest in a project (PIN required)' })
  invest(
    @CurrentUser() u: any,
    @Param('id') id: string,
    @Body() dto: InvestDto,
    @Ip() ip: string,
  ) {
    return this.svc.invest(u.id, id, dto, ip);
  }
}

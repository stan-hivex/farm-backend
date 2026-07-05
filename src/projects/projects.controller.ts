import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../common/guards/jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { InvestProjectDto } from './dto/invest-project.dto';
import type { Request } from 'express';

@ApiTags('Projects')
@ApiBearerAuth('JWT')
@UseGuards(JwtGuard)
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Permissions('projects:read')
  @Get()
  getAll() {
    return this.svc.findAll();
  }

  @Permissions('projects:read')
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Permissions('projects:write')
  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Permissions('projects:write')
  @Post('invest')
  invest(
    @Body() dto: InvestProjectDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.svc.invest(user.id, dto, req.ip || '');
  }
}
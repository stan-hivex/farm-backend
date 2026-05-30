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

  @Get()
  getAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Post('invest')
  invest(
    @Body() dto: InvestProjectDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.svc.invest(user.id, dto, req.ip || '');
  }
}
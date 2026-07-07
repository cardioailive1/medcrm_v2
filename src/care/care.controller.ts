import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CareModel } from '@prisma/client';
import { CareService } from './care.service';
import { EnrollDto } from './dto/enroll.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
import { CreateGapDto } from './dto/create-gap.dto';
import { UpdateGapDto } from './dto/update-gap.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('care')
export class CareController {
  constructor(private care: CareService) {}

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.care.summary(u.organizationId);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('enrollments')
  list(@CurrentUser() u: AuthUser, @Query('model') model?: CareModel) {
    return this.care.enrollments(u.organizationId, model);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('enrollments/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.care.detail(u.organizationId, id);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Post('enrollments')
  enroll(@CurrentUser() u: AuthUser, @Body() dto: EnrollDto) {
    return this.care.enroll(u.organizationId, dto);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Patch('enrollments/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.care.update(u.organizationId, id, dto);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Delete('enrollments/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.care.remove(u.organizationId, id);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Post('enrollments/:id/activities')
  log(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: LogActivityDto) {
    return this.care.logActivity(u.organizationId, id, u.id, dto);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser) {
    return this.care.dashboard(u.organizationId);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('gaps')
  gaps(@CurrentUser() u: AuthUser, @Query('status') status?: 'OPEN' | 'CLOSED') {
    return this.care.gaps(u.organizationId, status);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Post('gaps')
  createGap(@CurrentUser() u: AuthUser, @Body() dto: CreateGapDto) {
    return this.care.createGap(u.organizationId, dto);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Patch('gaps/:id')
  updateGap(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateGapDto) {
    return this.care.updateGap(u.organizationId, id, dto);
  }
}

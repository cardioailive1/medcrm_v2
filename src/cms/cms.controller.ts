import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Tier } from '@prisma/client';
import { CmsService } from './cms.service';
import { CreateMeasureDto } from './create-measure.dto';
import { UpdateMeasureDto } from './update-measure.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { MinTier } from '../common/decorators/min-tier.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('cms')
@MinTier(Tier.ENTERPRISE)
export class CmsController {
  constructor(private svc: CmsService) {}

  @RequirePermissions(Permission.REPORT_READ)
  @Get()
  byProgram(@CurrentUser() u: AuthUser) {
    return this.svc.byProgram(u.organizationId);
  }

  @RequirePermissions(Permission.BILLING_MANAGE)
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateMeasureDto) {
    return this.svc.create(u.organizationId, dto);
  }

  @RequirePermissions(Permission.BILLING_MANAGE)
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMeasureDto) {
    return this.svc.update(u.organizationId, id, dto);
  }

  @RequirePermissions(Permission.BILLING_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.organizationId, id);
  }
}

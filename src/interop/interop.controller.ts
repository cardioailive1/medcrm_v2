import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Tier } from '@prisma/client';
import { InteropService } from './interop.service';
import { CreateResourceDto } from './create-resource.dto';
import { SaveConnectionDto } from './save-connection.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { MinTier } from '../common/decorators/min-tier.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('interop')
@MinTier(Tier.ENTERPRISE)
export class InteropController {
  constructor(private svc: InteropService) {}

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('status')
  status(@CurrentUser() u: AuthUser) {
    return this.svc.status(u.organizationId);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('connections')
  connections(@CurrentUser() u: AuthUser) {
    return this.svc.connections(u.organizationId);
  }

  @RequirePermissions(Permission.ORG_MANAGE)
  @Post('connections')
  saveConnection(@CurrentUser() u: AuthUser, @Body() dto: SaveConnectionDto) {
    return this.svc.saveConnection(u.organizationId, dto);
  }

  @RequirePermissions(Permission.ORG_MANAGE)
  @Post('connections/:kind/test')
  test(@CurrentUser() u: AuthUser, @Param('kind') kind: string) {
    return this.svc.testConnection(u.organizationId, kind.toUpperCase());
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get()
  list(@CurrentUser() u: AuthUser, @Query('kind') kind?: string) {
    return this.svc.list(u.organizationId, kind);
  }

  @RequirePermissions(Permission.ORG_MANAGE)
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateResourceDto) {
    return this.svc.create(u.organizationId, dto);
  }

  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Post('fhir/import')
  fhirImport(@CurrentUser() u: AuthUser) {
    return this.svc.fhirImport(u.organizationId);
  }
}

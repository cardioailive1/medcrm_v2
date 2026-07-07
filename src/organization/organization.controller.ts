import { Body, Controller, Get, Patch } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { UpdateCareModelsDto } from './dto/update-care-models.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('organization')
export class OrganizationController {
  constructor(private org: OrganizationService) {}

  // Any authenticated member can read their org's care-model configuration.
  @Get()
  get(@CurrentUser() u: AuthUser) {
    return this.org.get(u.organizationId);
  }

  // Care-model selection is a practice-configuration task available to clinical staff
  // (PATIENT_UPDATE), not just org admins — so any authorized user can pick their models.
  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Patch('care-models')
  updateCareModels(@CurrentUser() u: AuthUser, @Body() dto: UpdateCareModelsDto) {
    return this.org.updateCareModels(u.organizationId, dto);
  }
}

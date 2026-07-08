import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { UpdateCareModelsDto } from './dto/update-care-models.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
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

  // Only admins (ORG_MANAGE) can change which care models the practice runs.
  @RequirePermissions(Permission.ORG_MANAGE)
  @Patch('care-models')
  updateCareModels(@CurrentUser() u: AuthUser, @Body() dto: UpdateCareModelsDto) {
    return this.org.updateCareModels(u.organizationId, dto);
  }

  // Team management (admin only): list members, approve pending accounts, assign roles.
  @RequirePermissions(Permission.USER_READ)
  @Get('members')
  members(@CurrentUser() u: AuthUser) {
    return this.org.members(u.organizationId);
  }

  @RequirePermissions(Permission.USER_MANAGE)
  @Patch('members/:id')
  updateMember(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.org.updateMember(u.organizationId, id, dto);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Tier } from '@prisma/client';
import { AgentsService } from './agents.service';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateAgentDto } from './update-agent.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { MinTier } from '../common/decorators/min-tier.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('agents')
@MinTier(Tier.PRO)
export class AgentsController {
  constructor(private svc: AgentsService) {}

  @RequirePermissions(Permission.PATIENT_READ)
  @Get('activity')
  feed(@CurrentUser() u: AuthUser, @Query('take') take?: string) {
    return this.svc.feed(u.organizationId, take ? parseInt(take, 10) : 30);
  }

  @RequirePermissions(Permission.PATIENT_CREATE)
  @Post('activity')
  log(@CurrentUser() u: AuthUser, @Body() dto: CreateActivityDto) {
    return this.svc.log(u.organizationId, dto);
  }

  @RequirePermissions(Permission.PATIENT_READ)
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.organizationId);
  }

  // Deploy / pause / configure (admins). Setting an integration endpoint marks it ready.
  @RequirePermissions(Permission.ORG_MANAGE)
  @Patch(':key')
  update(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: UpdateAgentDto) {
    return this.svc.update(u.organizationId, key, dto);
  }

  // Run an agent (clinical/regulatory ones are gated until integration is configured & validated).
  @RequirePermissions(Permission.PATIENT_UPDATE)
  @Post(':key/run')
  run(@CurrentUser() u: AuthUser, @Param('key') key: string) {
    return this.svc.run(u.organizationId, key);
  }
}

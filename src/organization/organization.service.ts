import { Injectable } from '@nestjs/common';
import { CareModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCareModelsDto } from './dto/update-care-models.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

const ORG_SELECT = {
  id: true,
  name: true,
  tier: true,
  subscriptionStatus: true,
  primaryCareModel: true,
  careModels: true,
  careModelsConfigured: true,
} as const;

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  get(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: ORG_SELECT,
    });
  }

  updateCareModels(organizationId: string, dto: UpdateCareModelsDto) {
    const primary = dto.primaryCareModel ?? CareModel.VALUE_BASED_CARE;
    // The primary model is always enabled; dedupe the rest.
    const enabled = new Set<CareModel>(dto.careModels ?? []);
    enabled.add(primary);
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        primaryCareModel: primary,
        careModels: Array.from(enabled),
        careModelsConfigured: true,
      },
      select: ORG_SELECT,
    });
  }

  // ----- Team / members -----
  members(orgId: string) {
    return this.prisma.user.findMany({
      where: { organizationId: orgId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async updateMember(orgId: string, memberId: string, dto: UpdateMemberDto) {
    const m = await this.prisma.user.findFirst({ where: { id: memberId, organizationId: orgId }, select: { id: true } });
    if (!m) throw new Error('Member not found');
    return this.prisma.user.update({
      where: { id: memberId },
      data: { ...(dto.role ? { role: dto.role } : {}), ...(dto.status ? { status: dto.status } : {}) },
      select: { id: true, email: true, role: true, status: true },
    });
  }
}

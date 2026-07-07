import { Injectable } from '@nestjs/common';
import { CareModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCareModelsDto } from './dto/update-care-models.dto';

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
}

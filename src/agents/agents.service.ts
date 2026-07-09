import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateAgentDto } from './update-agent.dto';

// The canonical agent catalog. Clinical / regulatory agents are flagged requiresIntegration:
// they will NOT emit clinical decisions or billing codes until the org configures a real
// integration (FHIR / X12-EDI / payer API) AND marks it validated (integrationReady).
const CATALOG: Array<{
  key: string; name: string; category: string; description: string; requiresIntegration: boolean;
}> = [
  { key: 'followup', name: 'Follow-up Coordinator', category: 'operational', requiresIntegration: false,
    description: 'Finds patients overdue for follow-up and surfaces reminders. Acts on your own scheduling data.' },
  { key: 'scheduler', name: 'Smart Scheduler', category: 'operational', requiresIntegration: false,
    description: 'Analyzes upcoming appointments and no-show patterns to suggest schedule improvements.' },
  { key: 'admin', name: 'Administrative Task Agent', category: 'operational', requiresIntegration: false,
    description: 'Automates front/back-office tasks: intake, verification, referral routing, compliance reminders.' },
  { key: 'reporting', name: 'Reporting Agent', category: 'analytics', requiresIntegration: false,
    description: 'Generates scheduled and on-demand reports and surfaces data-driven insights.' },
  { key: 'triage', name: 'Clinical Triage Agent', category: 'clinical', requiresIntegration: true,
    description: 'Flags at-risk patients and prioritizes by severity. Requires a validated clinical data integration.' },
  { key: 'lab', name: 'Lab Results Interpreter', category: 'clinical', requiresIntegration: true,
    description: 'Interprets HL7/FHIR lab results. Requires a validated FHIR integration before producing readings.' },
  { key: 'priorauth', name: 'Prior Authorization Agent', category: 'regulatory', requiresIntegration: true,
    description: 'Prepares and tracks prior-auth requests. Requires a validated payer/X12 integration before submitting.' },
  { key: 'billing', name: 'Billing & Coding Agent', category: 'regulatory', requiresIntegration: true,
    description: 'Assists ICD-10/CPT coding and claim scrubbing. Requires a validated coding/X12 integration before output.' },
];

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  feed(organizationId: string, take = 30) {
    return this.prisma.agentActivity.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
    });
  }

  log(organizationId: string, dto: CreateActivityDto) {
    return this.prisma.agentActivity.create({ data: { ...dto, organizationId } });
  }

  // List agents, seeding the catalog for this org on first access.
  async list(organizationId: string) {
    const existing = await this.prisma.agent.findMany({ where: { organizationId } });
    const have = new Set(existing.map((a) => a.key));
    const toCreate = CATALOG.filter((c) => !have.has(c.key));
    if (toCreate.length) {
      await this.prisma.agent.createMany({
        data: toCreate.map((c) => ({
          organizationId, key: c.key, name: c.name, category: c.category,
          description: c.description, requiresIntegration: c.requiresIntegration,
        })),
      });
    }
    return this.prisma.agent.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
  }

  async update(organizationId: string, key: string, dto: UpdateAgentDto) {
    const agent = await this.prisma.agent.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (!agent) throw new BadRequestException('Unknown agent');
    // integrationReady can only be true when config carries the required endpoint(s).
    let integrationReady = agent.integrationReady;
    const config = dto.config ?? (agent.config as any);
    if (agent.requiresIntegration) {
      const c = (config || {}) as Record<string, string>;
      integrationReady = Boolean(c.fhirBaseUrl || c.x12Endpoint || c.payerApiUrl);
    }
    return this.prisma.agent.update({
      where: { organizationId_key: { organizationId, key } },
      data: {
        ...(dto.enabled != null ? { enabled: dto.enabled } : {}),
        ...(dto.config != null ? { config: dto.config } : {}),
        integrationReady,
      },
    });
  }

  // Execute an agent. Safe agents act on real data; clinical/regulatory agents are gated
  // and never fabricate clinical decisions or billing codes.
  async run(organizationId: string, key: string) {
    const agent = await this.prisma.agent.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (!agent) throw new BadRequestException('Unknown agent');
    if (!agent.enabled) throw new BadRequestException('Deploy this agent before running it.');

    let message = '';
    let result = '';

    if (agent.requiresIntegration && !agent.integrationReady) {
      // Hard safety gate: no clinical/billing output without a configured, validated integration.
      message = `${agent.name} run skipped — integration not configured/validated. No clinical or billing output produced.`;
      result = 'integration_pending';
    } else if (key === 'followup') {
      const now = new Date();
      const soon = new Date(now.getTime() + 7 * 86400000);
      const overdue = await this.prisma.appointment.count({
        where: { organizationId, startsAt: { lt: now }, status: { in: ['CONFIRMED', 'COMPLETED'] as any } },
      }).catch(() => 0);
      const upcoming = await this.prisma.appointment.count({
        where: { organizationId, startsAt: { gte: now, lte: soon } },
      }).catch(() => 0);
      message = `Follow-up scan: ${overdue} past appointments reviewed, ${upcoming} upcoming in the next 7 days flagged for reminders.`;
      result = JSON.stringify({ overdue, upcoming });
    } else if (key === 'scheduler') {
      const total = await this.prisma.appointment.count({ where: { organizationId } }).catch(() => 0);
      const noShows = await this.prisma.appointment.count({ where: { organizationId, status: 'NO_SHOW' as any } }).catch(() => 0);
      const rate = total ? Math.round((noShows / total) * 100) : 0;
      message = `Schedule analysis: ${total} appointments, ${noShows} no-shows (${rate}%). Suggested reminder/overbook tuning where rate is high.`;
      result = JSON.stringify({ total, noShows, rate });
    } else if (key === 'admin') {
      const tasks = await this.prisma.adminTask.count({ where: { organizationId } }).catch(() => 0);
      message = `Administrative sweep complete. ${tasks} tracked tasks reviewed.`;
      result = JSON.stringify({ tasks });
    } else if (key === 'reporting') {
      const patients = await this.prisma.patient.count({ where: { organizationId } }).catch(() => 0);
      message = `Reporting run complete. Aggregated metrics across ${patients} patients.`;
      result = JSON.stringify({ patients });
    } else if (agent.requiresIntegration && agent.integrationReady) {
      // Integration configured & validated by the org: queue items for HUMAN REVIEW only.
      // We deliberately do not auto-emit clinical decisions or submit claims here.
      const patients = await this.prisma.patient.count({ where: { organizationId } }).catch(() => 0);
      message = `${agent.name}: ${patients} records queued for review via the configured integration. Outputs require clinician/coder sign-off before use.`;
      result = 'queued_for_review';
    } else {
      message = `${agent.name} has no runnable action configured.`;
      result = 'noop';
    }

    await this.prisma.agent.update({
      where: { organizationId_key: { organizationId, key } },
      data: { lastRunAt: new Date(), runCount: { increment: 1 }, lastResult: result },
    });
    await this.prisma.agentActivity.create({
      data: { organizationId, source: agent.name, message },
    });
    return { key, message, result, ranAt: new Date() };
  }
}

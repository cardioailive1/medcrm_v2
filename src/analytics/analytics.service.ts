import { Injectable } from '@nestjs/common';
import { Modality } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Aggregates derived from real records — no hardcoded figures.
  async overview(organizationId: string) {
    const [patients, appts, inPerson, telehealth, noShows, surveys, sessions] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId } }),
      this.prisma.appointment.count({ where: { organizationId } }),
      this.prisma.appointment.count({ where: { organizationId, modality: Modality.IN_PERSON } }),
      this.prisma.appointment.count({ where: { organizationId, modality: Modality.TELEHEALTH } }),
      this.prisma.appointment.count({ where: { organizationId, status: 'NO_SHOW' } }),
      this.prisma.survey.findMany({ where: { organizationId }, select: { rating: true } }),
      this.prisma.telehealthSession.count({ where: { organizationId } }),
    ]);

    const deptGroups = await this.prisma.patient.groupBy({
      by: ['department'],
      where: { organizationId },
      _count: true,
    });

    const satisfaction = surveys.length
      ? Number((surveys.reduce((s, x) => s + x.rating, 0) / surveys.length).toFixed(2))
      : 0;

    return {
      patients,
      appointments: appts,
      telehealthSessions: sessions,
      modalitySplit: { inPerson, telehealth },
      noShows,
      satisfaction, // 0..5
      byDepartment: deptGroups.map((d) => ({ department: d.department || 'Unspecified', count: d._count })),
    };
  }

  // Value-Based Care population-health analytics. All figures derive from real records.
  // The high-cost "risk indicator" is a TRANSPARENT rules-based score for triage/prioritization —
  // not a validated predictive model. ROI uses stated, override-able assumptions.
  async populationHealth(
    organizationId: string,
    opts: { costPerIntervention?: number; avoidedEventValue?: number; avoidanceRate?: number } = {},
  ) {
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    const [patients, enrollments, openGapRows, closedGaps, activities] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId } }),
      this.prisma.careEnrollment.findMany({
        where: { organizationId, status: 'ACTIVE' },
        select: { patientId: true, model: true, riskLevel: true },
      }),
      this.prisma.careGap.groupBy({ by: ['patientId'], where: { organizationId, status: 'OPEN' }, _count: true }),
      this.prisma.careGap.count({ where: { organizationId, status: 'CLOSED' } }),
      this.prisma.careActivity.count({ where: { organizationId, occurredAt: { gte: monthAgo } } }),
    ]);

    // Risk stratification (real, from enrollment risk levels).
    const risk = { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>;
    const byModel: Record<string, number> = {};
    const perPatient: Record<string, { risk: string; chronic: boolean }> = {};
    for (const e of enrollments) {
      risk[e.riskLevel] = (risk[e.riskLevel] || 0) + 1;
      byModel[e.model] = (byModel[e.model] || 0) + 1;
      const chronic = ['CHRONIC_CARE_MANAGEMENT', 'COMPLEX_CARE_MANAGEMENT', 'PRINCIPAL_CARE_MANAGEMENT'].includes(e.model);
      const cur = perPatient[e.patientId];
      if (!cur) perPatient[e.patientId] = { risk: e.riskLevel, chronic };
      else { if (e.riskLevel === 'HIGH') cur.risk = 'HIGH'; cur.chronic = cur.chronic || chronic; }
    }
    const openGapByPatient: Record<string, number> = {};
    openGapRows.forEach((g) => (openGapByPatient[g.patientId] = g._count));
    const openGaps = openGapRows.reduce((a, g) => a + g._count, 0);

    // Transparent composite indicator: HIGH +2, each open gap +1, chronic/complex program +1.
    const tiers = { elevated: 0, moderate: 0, low: 0 };
    Object.keys(perPatient).forEach((pid) => {
      const p = perPatient[pid];
      let score = 0;
      if (p.risk === 'HIGH') score += 2; else if (p.risk === 'MEDIUM') score += 1;
      score += openGapByPatient[pid] || 0;
      if (p.chronic) score += 1;
      if (score >= 3) tiers.elevated++; else if (score >= 1) tiers.moderate++; else tiers.low++;
    });

    const attributed = Object.keys(perPatient).length;
    const totalGaps = openGaps + closedGaps;

    // ROI of preventive interventions — stated assumptions, override-able by the org.
    const costPerIntervention = opts.costPerIntervention ?? 25;      // $ per care-coordination touchpoint
    const avoidedEventValue = opts.avoidedEventValue ?? 12000;       // $ est. cost of one avoided high-cost CV event
    const avoidanceRate = opts.avoidanceRate ?? 0.1;                 // share of engaged elevated-risk that avoid an event
    const programCost = activities * costPerIntervention;
    const estimatedAvoidedCost = Math.round(tiers.elevated * avoidanceRate * avoidedEventValue);
    const netSavings = estimatedAvoidedCost - programCost;
    const roiPct = programCost > 0 ? Math.round((netSavings / programCost) * 100) : 0;

    return {
      cohort: { patients, attributed, byModel },
      risk,
      gaps: { open: openGaps, closed: closedGaps, closureRate: totalGaps ? Math.round((closedGaps / totalGaps) * 100) : 0 },
      highCostRisk: {
        method: 'Rules-based indicator for prioritization — not a validated predictive model.',
        rule: 'HIGH risk +2 (MEDIUM +1); each open care gap +1; chronic/complex program +1. Score >=3 elevated, 1-2 moderate, 0 low.',
        tiers,
      },
      roi: {
        period: 'last 30 days',
        interventions: activities,
        assumptions: { costPerIntervention, avoidedEventValue, avoidanceRate },
        programCost, estimatedAvoidedCost, netSavings, roiPct,
      },
    };
  }
}

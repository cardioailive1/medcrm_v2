import { Injectable, NotFoundException } from '@nestjs/common';
import { CareModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollDto } from './dto/enroll.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
import { CreateGapDto } from './dto/create-gap.dto';
import { UpdateGapDto } from './dto/update-gap.dto';

type Metric = 'minutes' | 'readingDays' | 'contact' | 'none';
const TARGETS: Record<string, { metric: Metric; target: number; label: string }> = {
  CHRONIC_CARE_MANAGEMENT: { metric: 'minutes', target: 20, label: '20 min / month (CPT 99490)' },
  PRINCIPAL_CARE_MANAGEMENT: { metric: 'minutes', target: 30, label: '30 min / month (CPT 99424)' },
  COMPLEX_CARE_MANAGEMENT: { metric: 'minutes', target: 60, label: '60 min / month (CPT 99487)' },
  BEHAVIORAL_HEALTH_INTEGRATION: { metric: 'minutes', target: 20, label: '20 min / month (CPT 99484)' },
  REMOTE_PATIENT_MONITORING: { metric: 'readingDays', target: 16, label: '16 device-days / month (CPT 99454)' },
  TRANSITIONAL_CARE_MANAGEMENT: { metric: 'contact', target: 1, label: 'Contact <= 2 business days, visit <= 14 days' },
  VALUE_BASED_CARE: { metric: 'none', target: 0, label: 'Outcome & quality based' },
  POPULATION_HEALTH: { metric: 'none', target: 0, label: 'Population outcomes' },
  FEE_FOR_SERVICE: { metric: 'none', target: 0, label: 'Per-service billing' },
};

function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

@Injectable()
export class CareService {
  constructor(private prisma: PrismaService) {}

  private progressFor(model: string, acts: { minutes: number | null; readingDays: number | null; type: string }[]) {
    const t = TARGETS[model] ?? { metric: 'none' as Metric, target: 0, label: '' };
    let current = 0;
    if (t.metric === 'minutes') current = acts.reduce((a, x) => a + (x.minutes ?? 0), 0);
    else if (t.metric === 'readingDays') current = acts.reduce((a, x) => a + (x.readingDays ?? 0), 0);
    else if (t.metric === 'contact') current = acts.filter((x) => x.type === 'CONTACT').length;
    const progress = t.target ? Math.min(100, Math.round((current / t.target) * 100)) : 0;
    return { metric: t.metric, target: t.target, targetLabel: t.label, current, progress, onTrack: t.metric === 'none' ? true : current >= t.target };
  }

  async summary(orgId: string) {
    const rows = await this.prisma.careEnrollment.findMany({
      where: { organizationId: orgId, status: 'ACTIVE' },
      include: { activities: { where: { occurredAt: { gte: monthStart() } } } },
    });
    const byModel: Record<string, { model: string; count: number; onTrack: number; targetLabel: string; metric: Metric }> = {};
    for (const e of rows) {
      const p = this.progressFor(e.model, e.activities);
      const m = byModel[e.model] ?? (byModel[e.model] = { model: e.model, count: 0, onTrack: 0, targetLabel: p.targetLabel, metric: p.metric });
      m.count++;
      if (p.onTrack) m.onTrack++;
    }
    return { models: Object.values(byModel) };
  }

  async enrollments(orgId: string, model?: CareModel) {
    const rows = await this.prisma.careEnrollment.findMany({
      where: { organizationId: orgId, ...(model ? { model } : {}) },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        activities: { where: { occurredAt: { gte: monthStart() } } },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    return rows.map((e) => ({
      id: e.id, model: e.model, status: e.status, riskLevel: e.riskLevel, enrolledAt: e.enrolledAt,
      dischargeDate: e.dischargeDate, notes: e.notes, patient: e.patient, ...this.progressFor(e.model, e.activities),
    }));
  }

  async detail(orgId: string, id: string) {
    const e = await this.prisma.careEnrollment.findFirst({
      where: { id, organizationId: orgId },
      include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } }, activities: { orderBy: { occurredAt: 'desc' } } },
    });
    if (!e) throw new NotFoundException('Enrollment not found');
    const monthAct = e.activities.filter((a) => a.occurredAt >= monthStart());
    return { id: e.id, model: e.model, status: e.status, riskLevel: e.riskLevel, enrolledAt: e.enrolledAt, dischargeDate: e.dischargeDate, notes: e.notes, patient: e.patient, activities: e.activities, ...this.progressFor(e.model, monthAct) };
  }

  enroll(orgId: string, dto: EnrollDto) {
    return this.prisma.careEnrollment.create({
      data: { organizationId: orgId, patientId: dto.patientId, model: dto.model, riskLevel: dto.riskLevel ?? 'MEDIUM', dischargeDate: dto.dischargeDate ? new Date(dto.dischargeDate) : null, notes: dto.notes },
    });
  }

  async update(orgId: string, id: string, dto: UpdateEnrollmentDto) {
    await this.assert(orgId, id);
    return this.prisma.careEnrollment.update({
      where: { id },
      data: { ...(dto.status ? { status: dto.status } : {}), ...(dto.riskLevel ? { riskLevel: dto.riskLevel } : {}), ...(dto.notes !== undefined ? { notes: dto.notes } : {}), ...(dto.dischargeDate ? { dischargeDate: new Date(dto.dischargeDate) } : {}) },
    });
  }

  async remove(orgId: string, id: string) {
    await this.assert(orgId, id);
    return this.prisma.careEnrollment.delete({ where: { id } });
  }

  async logActivity(orgId: string, id: string, userId: string, dto: LogActivityDto) {
    await this.assert(orgId, id);
    return this.prisma.careActivity.create({
      data: { organizationId: orgId, enrollmentId: id, type: dto.type, minutes: dto.minutes, readingDays: dto.readingDays, note: dto.note, occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(), createdById: userId },
    });
  }

  private async assert(orgId: string, id: string) {
    const e = await this.prisma.careEnrollment.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
    if (!e) throw new NotFoundException('Enrollment not found');
  }

  // ----- Care gaps -----
  gaps(orgId: string, status?: 'OPEN' | 'CLOSED') {
    return this.prisma.careGap.findMany({
      where: { organizationId: orgId, ...(status ? { status } : {}) },
      include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } } },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  createGap(orgId: string, dto: CreateGapDto) {
    return this.prisma.careGap.create({
      data: { organizationId: orgId, patientId: dto.patientId, measure: dto.measure, dueDate: dto.dueDate ? new Date(dto.dueDate) : null },
    });
  }

  async updateGap(orgId: string, id: string, dto: UpdateGapDto) {
    const g = await this.prisma.careGap.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
    if (!g) throw new NotFoundException('Care gap not found');
    return this.prisma.careGap.update({
      where: { id },
      data: { status: dto.status, closedAt: dto.status === 'CLOSED' ? new Date() : null },
    });
  }

  // ----- Value-Based Care dashboard -----
  async dashboard(orgId: string) {
    const now = new Date();
    const [enrollments, riskGroups, openGaps, closedGaps, overdue] = await Promise.all([
      this.prisma.careEnrollment.findMany({
        where: { organizationId: orgId, status: 'ACTIVE' },
        include: { activities: { where: { occurredAt: { gte: monthStart() } } } },
      }),
      this.prisma.careEnrollment.groupBy({
        by: ['riskLevel'],
        where: { organizationId: orgId, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      this.prisma.careGap.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      this.prisma.careGap.count({ where: { organizationId: orgId, status: 'CLOSED' } }),
      this.prisma.careGap.count({ where: { organizationId: orgId, status: 'OPEN', dueDate: { lt: now } } }),
    ]);

    let onTrack = 0, billable = 0;
    for (const e of enrollments) {
      const p = this.progressFor(e.model, e.activities);
      if (p.metric !== 'none') { billable++; if (p.onTrack) onTrack++; }
    }
    const risk = { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>;
    riskGroups.forEach((g) => { risk[g.riskLevel] = g._count._all; });
    const totalGaps = openGaps + closedGaps;

    return {
      attributed: enrollments.length,
      risk,
      programsOnTrack: onTrack,
      programsBillable: billable,
      onTrackRate: billable ? Math.round((onTrack / billable) * 100) : 0,
      gaps: { open: openGaps, closed: closedGaps, overdue, closureRate: totalGaps ? Math.round((closedGaps / totalGaps) * 100) : 0 },
    };
  }
}

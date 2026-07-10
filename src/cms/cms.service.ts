import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeasureDto } from './create-measure.dto';
import { UpdateMeasureDto } from './update-measure.dto';

// Representative CMS quality-program starter set. Orgs edit values to their actuals.
const DEFAULTS: Array<{ program: string; name: string; value: number; target: number; unit: string; status: string }> = [
  { program: 'MIPS', name: 'Quality', value: 82, target: 75, unit: 'pts', status: 'met' },
  { program: 'MIPS', name: 'Promoting Interoperability', value: 68, target: 75, unit: 'pts', status: 'below' },
  { program: 'MIPS', name: 'Improvement Activities', value: 90, target: 40, unit: 'pts', status: 'met' },
  { program: 'MIPS', name: 'Cost', value: 78, target: 75, unit: 'pts', status: 'met' },
  { program: 'STAR', name: 'Overall Star Rating', value: 4, target: 5, unit: 'stars', status: 'borderline' },
  { program: 'STAR', name: 'Patient Experience (CAHPS)', value: 88, target: 90, unit: '%', status: 'borderline' },
  { program: 'VBC', name: 'ACO Quality Score', value: 88, target: 85, unit: 'pts', status: 'met' },
  { program: 'VBC', name: '30-day Readmission Rate', value: 18, target: 15, unit: '%', status: 'below' },
  { program: 'VBC', name: 'Shared Savings (MSSP)', value: 22400, target: 0, unit: '$', status: 'met' },
  { program: 'PI', name: 'FHIR Patient Access API', value: 70, target: 100, unit: '%', status: 'below' },
];

@Injectable()
export class CmsService {
  constructor(private prisma: PrismaService) {}

  private async seed(organizationId: string) {
    const count = await this.prisma.cmsMeasure.count({ where: { organizationId } });
    if (count > 0) return;
    await this.prisma.cmsMeasure.createMany({
      data: DEFAULTS.map((d) => ({ ...d, organizationId })),
    });
  }

  findAll(organizationId: string) {
    return this.prisma.cmsMeasure.findMany({
      where: { organizationId },
      orderBy: [{ program: 'asc' }, { name: 'asc' }],
    });
  }

  async byProgram(organizationId: string) {
    await this.seed(organizationId);
    const rows = await this.findAll(organizationId);
    return rows.reduce((acc: Record<string, any[]>, m) => {
      (acc[m.program] = acc[m.program] || []).push(m);
      return acc;
    }, {});
  }

  create(organizationId: string, dto: CreateMeasureDto) {
    return this.prisma.cmsMeasure.create({ data: { ...dto, organizationId } });
  }

  async update(organizationId: string, id: string, dto: UpdateMeasureDto) {
    const m = await this.prisma.cmsMeasure.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!m) throw new BadRequestException('Measure not found');
    return this.prisma.cmsMeasure.update({ where: { id }, data: { ...dto } });
  }

  async remove(organizationId: string, id: string) {
    const m = await this.prisma.cmsMeasure.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!m) throw new BadRequestException('Measure not found');
    return this.prisma.cmsMeasure.delete({ where: { id } });
  }
}

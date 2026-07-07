import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CareModel, RiskLevel } from '@prisma/client';

export class EnrollDto {
  @IsString()
  patientId!: string;

  @IsEnum(CareModel)
  model!: CareModel;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsDateString()
  dischargeDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

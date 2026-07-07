import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EnrollmentStatus, RiskLevel } from '@prisma/client';

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  dischargeDate?: string;
}

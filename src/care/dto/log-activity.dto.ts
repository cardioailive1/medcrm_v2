import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ActivityType } from '@prisma/client';

export class LogActivityDto {
  @IsEnum(ActivityType)
  type!: ActivityType;

  @IsOptional()
  @IsInt()
  @Min(0)
  minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  readingDays?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

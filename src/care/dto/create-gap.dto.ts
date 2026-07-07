import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateGapDto {
  @IsString()
  patientId!: string;

  @IsString()
  measure!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

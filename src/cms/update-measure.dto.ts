import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateMeasureDto {
  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsNumber()
  target?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsIn(['met', 'below', 'borderline'])
  status?: string;
}

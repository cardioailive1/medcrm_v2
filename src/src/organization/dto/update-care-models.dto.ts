import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { CareModel } from '@prisma/client';

export class UpdateCareModelsDto {
  @IsOptional()
  @IsEnum(CareModel)
  primaryCareModel?: CareModel;

  @IsOptional()
  @IsArray()
  @IsEnum(CareModel, { each: true })
  careModels?: CareModel[];
}

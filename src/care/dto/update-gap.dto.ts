import { IsEnum } from 'class-validator';
import { GapStatus } from '@prisma/client';

export class UpdateGapDto {
  @IsEnum(GapStatus)
  status!: GapStatus;
}

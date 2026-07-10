import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class SaveConnectionDto {
  @IsIn(['FHIR', 'HL7', 'PACS'])
  kind!: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsIn(['NONE', 'BEARER', 'BASIC'])
  authType?: string;

  @IsOptional()
  @IsString()
  authToken?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

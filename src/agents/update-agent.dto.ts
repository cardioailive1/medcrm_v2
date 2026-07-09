import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // Integration ports: { fhirBaseUrl?, x12Endpoint?, payerApiUrl?, notes? }
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

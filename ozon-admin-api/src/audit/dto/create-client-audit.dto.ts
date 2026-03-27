import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClientAuditDto {
  @IsString()
  @MaxLength(60)
  module!: string;

  @IsString()
  @MaxLength(80)
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operator?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;
}

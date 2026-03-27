import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateManualRateDto {
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  rubToCny?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  usdToRub?: number;

  @IsOptional()
  @IsBoolean()
  clearRubToCny?: boolean;

  @IsOptional()
  @IsBoolean()
  clearUsdToRub?: boolean;
}

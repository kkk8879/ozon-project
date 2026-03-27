import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'operator', 'viewer'])
  role?: 'admin' | 'operator' | 'viewer';

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}


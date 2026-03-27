import { IsString, MinLength } from 'class-validator';

export class ChangeFirstPasswordDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}


import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateStoreDto {
  @IsString({ message: '店铺名称必须是字符串' })
  @IsNotEmpty({ message: '店铺名称不能为空' })
  name: string;

  @IsString({ message: 'Client ID 必须是字符串' })
  @IsNotEmpty({ message: 'Client ID 不能为空' })
  clientId: string;

  @IsString({ message: 'API Key 必须是字符串' })
  @IsNotEmpty({ message: 'API Key 不能为空' })
  @MinLength(8, { message: 'API Key 长度不能少于 8 位' })
  apiKey: string;

  @IsOptional()
  @IsBoolean({ message: '状态必须是布尔值' })
  isActive?: boolean;
}

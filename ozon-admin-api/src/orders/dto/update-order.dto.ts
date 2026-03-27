import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ORDER_STATUS_VALUES = [
  'pending',
  'paid',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export class UpdateOrderDto {
  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

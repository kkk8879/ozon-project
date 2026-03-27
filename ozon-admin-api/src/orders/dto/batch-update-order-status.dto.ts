import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, Min } from 'class-validator';

const ORDER_STATUS_VALUES = [
  'pending',
  'paid',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export class BatchUpdateOrderStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];

  @IsIn(ORDER_STATUS_VALUES)
  status: string;
}

import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { BatchUpdateOrderStatusDto } from './dto/batch-update-order-status.dto';
import { SyncOrdersDto } from './dto/sync-orders.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Permissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Permissions('orders.read')
  getOrders() {
    return this.ordersService.getOrders();
  }

  @Get('summary')
  @Permissions('orders.read')
  getSummary() {
    return this.ordersService.getSummary();
  }

  @Get('statuses')
  @Permissions('orders.read')
  getStatuses() {
    return this.ordersService.getAvailableStatuses();
  }

  @Patch('batch/status')
  @Permissions('orders.update_status')
  batchUpdateStatus(
    @Body() body: BatchUpdateOrderStatusDto,
    @Headers('x-user-role') role?: string,
  ) {
    return this.ordersService.batchUpdateStatus(body, role);
  }

  @Post('sync')
  @Permissions('orders.sync')
  syncOrdersByApiKey(
    @Body() body: SyncOrdersDto,
    @Headers('x-user-role') role?: string,
  ) {
    return this.ordersService.syncOrdersByApiKey(body, role);
  }

  @Post('webhook/ozon')
  @Public()
  handleOzonWebhook(
    @Body() payload: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.ordersService.handleOzonWebhook(payload, headers);
  }

  @Get('sync-logs')
  @Permissions('orders.read')
  getSyncLogs(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.getSyncLogs(limit);
  }

  @Patch(':id')
  @Permissions('orders.edit_note')
  updateOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderDto,
    @Headers('x-user-role') role?: string,
  ) {
    return this.ordersService.updateOrder(id, body, role);
  }
}

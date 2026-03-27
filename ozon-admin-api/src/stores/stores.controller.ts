import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Permissions } from '../auth/permissions.decorator';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @Permissions('stores.read')
  async getStores() {
    return this.storesService.getStores();
  }

  @Get(':id/live-detail')
  @Permissions('stores.read')
  async getStoreLiveDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query('syncDays', new DefaultValuePipe(30), ParseIntPipe) syncDays: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('maxPages', new DefaultValuePipe(5), ParseIntPipe) maxPages: number,
  ) {
    return this.storesService.getStoreLiveDetail(id, {
      syncDays,
      limit,
      maxPages,
    });
  }

  @Post()
  @Permissions('stores.create')
  async createStore(
    @Body() body: CreateStoreDto,
    @Headers('x-user-role') role?: string,
  ) {
    return this.storesService.createStore(body, role);
  }

  @Patch(':id')
  @Permissions('stores.update')
  async updateStore(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStoreDto,
    @Headers('x-user-role') role?: string,
  ) {
    return this.storesService.updateStore(id, body, role);
  }

  @Delete(':id')
  @Permissions('stores.delete')
  async deleteStore(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-role') role?: string,
  ) {
    return this.storesService.deleteStore(id, role);
  }
}

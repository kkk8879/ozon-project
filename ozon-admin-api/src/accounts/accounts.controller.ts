import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';
import { AccountsService } from './accounts.service';
import { ChangeFirstPasswordDto } from './dto/change-first-password.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @Permissions('users.read')
  listAccounts() {
    return this.accountsService.listAccounts();
  }

  @Post()
  @Permissions('users.create')
  createAccount(
    @Body() body: CreateAccountDto,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-id') actorUserId?: string,
  ) {
    return this.accountsService.createAccount(body, role, actorUserId);
  }

  @Patch(':id')
  @Permissions('users.update')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAccountDto,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-id') actorUserId?: string,
  ) {
    return this.accountsService.updateAccount(id, body, role, actorUserId);
  }

  @Patch(':id/reset-password')
  @Permissions('users.reset_password')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetPasswordDto,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-id') actorUserId?: string,
  ) {
    return this.accountsService.resetPassword(id, body, role, actorUserId);
  }

  @Patch(':id/unlock')
  @Permissions('users.update')
  unlockAccount(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-id') actorUserId?: string,
  ) {
    return this.accountsService.unlockAccount(id, role, actorUserId);
  }

  @Delete(':id')
  @Permissions('users.delete')
  deleteAccount(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-user-role') role?: string,
    @Headers('x-user-id') actorUserId?: string,
  ) {
    return this.accountsService.deleteAccount(id, role, actorUserId);
  }

  @Post('login')
  @Public()
  login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Headers('x-forwarded-for') forwardedFor?: string,
  ) {
    const ip = (forwardedFor || req.ip || '').split(',')[0]?.trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.accountsService.login(body, { ip, userAgent });
  }

  @Post('change-first-password')
  @Public()
  changeFirstPassword(@Body() body: ChangeFirstPasswordDto) {
    return this.accountsService.changeFirstPassword(body);
  }
}

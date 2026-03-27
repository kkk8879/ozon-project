import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Permissions } from '../auth/permissions.decorator';
import { UpdateManualRateDto } from './dto/update-manual-rate.dto';
import { FxService } from './fx.service';

@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @Permissions('fx.read')
  getRates() {
    return this.fxService.getRates();
  }

  @Patch('rates/manual')
  @Permissions('fx.update')
  updateManualRates(@Body() body: UpdateManualRateDto) {
    return this.fxService.updateManualRates(body);
  }
}

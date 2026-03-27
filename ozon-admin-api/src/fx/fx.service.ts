import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateManualRateDto } from './dto/update-manual-rate.dto';

type AutoRates = {
  rubToCny: number;
  usdToRub: number;
  fetchedAt: Date;
};

@Injectable()
export class FxService {
  private readonly defaultRubToCny = this.toPositiveNumber(
    process.env.FX_DEFAULT_RUB_TO_CNY,
    0.08,
  );
  private readonly defaultUsdToRub = this.toPositiveNumber(
    process.env.FX_DEFAULT_USD_TO_RUB,
    90,
  );
  private readonly cacheTtlMs =
    this.toPositiveNumber(process.env.FX_CACHE_TTL_SECONDS, 300) * 1000;
  private cachedAutoRates: AutoRates | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getRates() {
    const settings = await this.getSettingsMap();

    const manualRubToCny = this.toOptionalPositiveNumber(
      settings.get('rub_to_cny'),
    );
    const manualUsdToRub = this.toOptionalPositiveNumber(
      settings.get('usd_to_rub'),
    );

    const auto = await this.getAutoRates();
    const rubToCny = manualRubToCny ?? auto.rubToCny;
    const usdToRub = manualUsdToRub ?? auto.usdToRub;

    const source =
      manualRubToCny !== null || manualUsdToRub !== null
        ? manualRubToCny !== null && manualUsdToRub !== null
          ? 'manual'
          : 'mixed'
        : 'realtime';

    return {
      rubToCny,
      usdToRub,
      source,
      realtimeUpdatedAt: auto.fetchedAt.toISOString(),
      manual: {
        rubToCny: manualRubToCny,
        usdToRub: manualUsdToRub,
      },
    };
  }

  async updateManualRates(body: UpdateManualRateDto) {
    if (body.clearRubToCny) {
      await this.deleteSetting('rub_to_cny');
    } else if (typeof body.rubToCny === 'number') {
      await this.upsertSetting('rub_to_cny', String(body.rubToCny));
    }

    if (body.clearUsdToRub) {
      await this.deleteSetting('usd_to_rub');
    } else if (typeof body.usdToRub === 'number') {
      await this.upsertSetting('usd_to_rub', String(body.usdToRub));
    }

    return this.getRates();
  }

  private async getAutoRates() {
    const now = Date.now();
    if (
      this.cachedAutoRates &&
      now - this.cachedAutoRates.fetchedAt.getTime() < this.cacheTtlMs
    ) {
      return this.cachedAutoRates;
    }

    const fetched = await this.fetchLiveRates();
    this.cachedAutoRates = fetched;
    return fetched;
  }

  private async fetchLiveRates(): Promise<AutoRates> {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const result = (await response.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };

      const usdToRub = result?.rates?.RUB;
      const usdToCny = result?.rates?.CNY;
      if (
        !response.ok ||
        result?.result !== 'success' ||
        typeof usdToRub !== 'number' ||
        typeof usdToCny !== 'number' ||
        usdToRub <= 0 ||
        usdToCny <= 0
      ) {
        throw new Error('invalid-rate-response');
      }

      return {
        usdToRub,
        rubToCny: usdToCny / usdToRub,
        fetchedAt: new Date(),
      };
    } catch {
      return {
        rubToCny: this.defaultRubToCny,
        usdToRub: this.defaultUsdToRub,
        fetchedAt: new Date(),
      };
    }
  }

  private async getSettingsMap(): Promise<Map<string, string>> {
    const settings = await this.prisma.fxRateSetting.findMany();
    return new Map<string, string>(
      settings.map((item) => [item.key, item.value] as [string, string]),
    );
  }

  private async upsertSetting(key: string, value: string) {
    await this.prisma.fxRateSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  private async deleteSetting(key: string) {
    await this.prisma.fxRateSetting.deleteMany({
      where: { key },
    });
  }

  private toOptionalPositiveNumber(value: string | undefined) {
    if (!value) return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private toPositiveNumber(input: string | undefined, fallback: number) {
    const parsed = Number(input);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
  }
}

import { OrderItem } from '../types/order';
import { FxRates } from '../types/fx';

const DEFAULT_RUB_TO_CNY = 0.08;
const DEFAULT_USD_TO_RUB = 90;

function resolveRates(rates?: FxRates | null) {
  return {
    rubToCny:
      rates && Number(rates.rubToCny) > 0 ? Number(rates.rubToCny) : DEFAULT_RUB_TO_CNY,
    usdToRub:
      rates && Number(rates.usdToRub) > 0 ? Number(rates.usdToRub) : DEFAULT_USD_TO_RUB,
  };
}

function toRubAmount(amount: number, currency: string, rates?: FxRates | null) {
  const value = Number(amount) || 0;
  const normalized = (currency || 'RUB').trim().toUpperCase();
  const { rubToCny, usdToRub } = resolveRates(rates);

  if (normalized === 'RUB') return value;
  if (normalized === 'CNY' || normalized === 'RMB') return value / rubToCny;
  if (normalized === 'USD') return value * usdToRub;

  return value;
}

function formatNumber(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatAmountDual(
  amount: number,
  currency: string,
  rates?: FxRates | null,
) {
  const { rubToCny } = resolveRates(rates);
  const rub = toRubAmount(amount, currency, rates);
  const cny = rub * rubToCny;
  return `${formatNumber(rub)} RUB / ${formatNumber(cny)} CNY`;
}

export function formatOrdersAmountDual(orders: OrderItem[], rates?: FxRates | null) {
  const { rubToCny } = resolveRates(rates);
  const rub = orders.reduce(
    (sum, order) => sum + toRubAmount(order.totalAmount, order.currency, rates),
    0,
  );
  const cny = rub * rubToCny;
  return `${formatNumber(rub)} RUB / ${formatNumber(cny)} CNY`;
}

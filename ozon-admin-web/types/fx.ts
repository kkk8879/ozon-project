export type FxRates = {
  rubToCny: number;
  usdToRub: number;
  source: 'manual' | 'realtime' | 'mixed' | string;
  realtimeUpdatedAt: string;
  manual: {
    rubToCny: number | null;
    usdToRub: number | null;
  };
};

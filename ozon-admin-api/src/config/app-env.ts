function toInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeOrigins(value: string | undefined) {
  if (!value || value.trim() === '') return ['http://localhost:3000'];

  if (value.trim() === '*') return true;

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const appEnv = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: toInt(process.env.PORT, 3001),
  corsOrigins: normalizeOrigins(process.env.CORS_ORIGINS),
  trustProxy: toBoolean(process.env.TRUST_PROXY, true),
};


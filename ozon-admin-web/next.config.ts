import type { NextConfig } from 'next';

const devOrigins = (
  process.env.NEXT_DEV_ALLOWED_ORIGINS ||
  'localhost,127.0.0.1,192.168.0.135'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Hide Next.js dev indicator (the floating "N" button) in development.
  devIndicators: false,
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: devOrigins,
};

export default nextConfig;

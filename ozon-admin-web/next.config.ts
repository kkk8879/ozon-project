import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Hide Next.js dev indicator (the floating "N" button) in development.
  devIndicators: false,
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;

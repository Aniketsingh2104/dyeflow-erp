import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.12.95'],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: eslint key removed — no longer supported in Next.js 16
  // ESLint is now configured via eslint.config.mjs only
};

export default nextConfig;

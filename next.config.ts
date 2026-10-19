import type { NextConfig } from "next";

// Security headers on every page and API response:
//   • the app can't be shown inside another site's frame (clickjacking)
//   • the browser won't guess file types, sends no full URLs to other sites,
//     and pages can't use camera / location (microphone: this site only)
// (A full script Content-Security-Policy needs per-request nonces in
//  Next.js — left for later; these lines carry no risk of a blank page.)
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // microphone stays allowed for this site only (AI Assistant voice input)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()' },
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.12.95'],
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: eslint key removed — no longer supported in Next.js 16
  // ESLint is now configured via eslint.config.mjs only
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // app-info-parser / playwright-core are server-only; keep them out of the bundle.
    serverComponentsExternalPackages: ['playwright-core'],
  },
};

module.exports = nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ws has optional native add-ons; keep it out of the server bundle.
  serverExternalPackages: ['ws'],
};

export default nextConfig;

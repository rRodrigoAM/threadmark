import type { NextConfig } from "next";

const internalApiUrl = process.env.SUPPORT_INTERNAL_API_URL ?? "http://127.0.0.1:4317";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${internalApiUrl}/health`,
      },
    ];
  },
};

export default nextConfig;

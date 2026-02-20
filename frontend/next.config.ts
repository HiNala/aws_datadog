import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // BACKEND_URL is the server-side (Docker internal) address for rewrites.
    // NEXT_PUBLIC_API_URL is the public address shown in the browser — not used here.
    const backendUrl = process.env.BACKEND_URL || "http://backend:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

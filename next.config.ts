import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.vercel.run"],
  images: { unoptimized: true },
};

export default nextConfig;

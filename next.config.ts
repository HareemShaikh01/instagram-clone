import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.vercel.run"],
  images: { unoptimized: true },
  output: "standalone",
};

export default nextConfig;

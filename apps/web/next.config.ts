import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@maraki/shared"],
  experimental: {
    optimizePackageImports: ["@maraki/shared"],
  },
};

export default config;

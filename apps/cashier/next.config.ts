import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@maraki/shared", "@maraki/ui"],
  experimental: {
    optimizePackageImports: ["@maraki/shared", "@maraki/ui"],
  },
};

export default config;

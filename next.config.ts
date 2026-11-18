import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["oracledb"],
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
};

export default config;

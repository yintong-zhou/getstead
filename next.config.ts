import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [{ source: "/", destination: "/en", permanent: false }];
  },
};

export default config;

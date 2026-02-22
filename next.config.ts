import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require("./package.json");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;

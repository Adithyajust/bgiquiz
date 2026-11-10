import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mssql"],
  // allowedDevOrigins: ["192.168.0.133"],
  allowedDevOrigins: ["192.168.30.218"], 
};

export default nextConfig;

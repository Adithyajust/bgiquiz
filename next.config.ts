import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mssql"],
  // allowedDevOrigins: ["192.168.0.133"],
  allowedDevOrigins: ["192.168.1.20"], 
};

export default nextConfig;

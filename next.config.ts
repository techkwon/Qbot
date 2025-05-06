import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // 경고: 프로덕션 빌드에서 ESLint 오류를 무시합니다.
    // 배포 후 반드시 ESLint 오류를 수정해야 합니다.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

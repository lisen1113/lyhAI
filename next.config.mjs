/** @type {import('next').NextConfig} */
// distDir 默认 .next；需要与正在运行的 dev server 隔离构建时，
// 可用 NEXT_DIST_DIR=.next-build npx next build 指定另一个输出目录，
// 避免构建过程清理 dev 正在使用的缓存。
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 容器部署必需：产出 .next/standalone（含精简 server.js 与运行期依赖）
  output: "standalone",
};

export default nextConfig;

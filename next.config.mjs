/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 별도 백엔드가 없다. API는 같은 프로젝트의 Route Handler(src/app/api/*)로 서빙되며
  // Vercel에서 각각 하나의 Function으로 배포된다. → 프록시 rewrite 불필요.
};

export default nextConfig;

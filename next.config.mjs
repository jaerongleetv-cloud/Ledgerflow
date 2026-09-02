/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const baseUrl = process.env.NEXT_PUBLIC_BASE44_APP_BASE_URL;
    if (!baseUrl) return [];

    const normalizedBase = baseUrl.replace(/\/$/, "");
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/:path*",
          destination: `${normalizedBase}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;

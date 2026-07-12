/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(),
      },
    ];
  },
  webpack(config, { isServer }) {
    if (isServer) {
      config.output = config.output || {};
      // Ensure server chunks are emitted under the `chunks/` folder
      config.output.chunkFilename = 'chunks/[id].js';
    }
    return config;
  },
};

function buildSecurityHeaders() {
  const isProduction = process.env.NODE_ENV === 'production';
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : '';
  const connectSources = ["'self'", 'http://localhost:4000', 'ws:', 'wss:', 'https:'];

  if (apiOrigin && !connectSources.includes(apiOrigin)) {
    connectSources.push(apiOrigin);
  }

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const headers = [
    {
      key: 'Content-Security-Policy',
      value: csp,
    },
    {
      key: 'Referrer-Policy',
      value: 'strict-origin-when-cross-origin',
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
    {
      key: 'X-Frame-Options',
      value: 'DENY',
    },
    {
      key: 'X-DNS-Prefetch-Control',
      value: 'off',
    },
    {
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow',
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(self), microphone=(), geolocation=(), payment=()',
    },
  ];

  if (isProduction) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=15552000; includeSubDomains',
    });
  }

  return headers;
}

export default nextConfig;

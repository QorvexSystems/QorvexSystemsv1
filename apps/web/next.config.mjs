/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  webpack(config, { isServer }) {
    if (isServer) {
      config.output = config.output || {};
      // Ensure server chunks are emitted under the `chunks/` folder
      config.output.chunkFilename = 'chunks/[id].js';
    }
    return config;
  },
};

export default nextConfig;

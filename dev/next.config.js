import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config here
  transpilePackages: ['payload-storage-cloudinary'],
  webpack: (config) => {
    // Ensure proper module resolution for ESM packages
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs'],
    }
    return config
  },
}

export default withPayload(nextConfig)
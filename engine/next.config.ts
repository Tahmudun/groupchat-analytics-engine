import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image: Next traces the
  // needed node_modules into .next/standalone, so the runtime stage carries
  // no build toolchain.
  output: 'standalone',
  // postgres + argon2 use native/node APIs; keep them out of the bundler.
  serverExternalPackages: ['postgres', '@node-rs/argon2'],
  // Repo root and engine/ both have lockfiles; pin tracing to engine so Next
  // doesn't warn about an inferred workspace root.
  outputFileTracingRoot: path.join(__dirname),
  // Every image on the site is an inline data: URI or a plain <img>; nothing
  // uses next/image. Turning the optimizer off removes the /_next/image
  // endpoint entirely — the surface behind Next's 2026 image-optimizer RCE
  // advisories — rather than leaving an unused attack surface switched on.
  images: { unoptimized: true },
};

export default nextConfig;

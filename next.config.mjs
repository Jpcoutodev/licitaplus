/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que o Next infira uma raiz errada por causa de lockfiles em pastas acima.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;

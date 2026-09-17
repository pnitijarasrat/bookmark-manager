import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The tenant only allows http://localhost:3000, so the port can't drift.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    unstubGlobals: true,
  },
});

import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// Icons are written next to the source image, so the source lives in public/.
// Re-run after replacing public/logo.png: pnpm generate-pwa-assets
export default defineConfig({
  preset: {
    ...preset,
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#0D0E10' },
    },
  },
  images: ['public/logo.png'],
});

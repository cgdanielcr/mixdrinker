import { defineConfig } from 'vite';

/**
 * A one-file build: every chunk inlined so the game can be handed around as a
 * single HTML document (an Artifact link, an email, a USB stick) with no
 * server and no asset paths to get wrong.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true, manualChunks: undefined },
    },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  // Repo is public; GitHub Pages serves from /<repo>/. Relative base keeps
  // both Pages and itch.io (zip upload) working without a rebuild.
  base: './',
  server: { open: true },
  build: { target: 'es2022' },
});

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Vite configuration.  We enable the Vue plugin and set up an alias
// so that `@` maps to the `src` directory.  This mirrors the
// convention used by the Vue CLI and makes it easy to import
// components and stores without having to traverse many relative
// directories.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  },
});
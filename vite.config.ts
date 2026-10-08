import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: { index: 'src/index.ts', vue: 'src/vue/index.ts', app: 'src/app/index.ts', kit: 'src/app/kit.ts', dev: 'src/dev/adminMock.ts' },
      formats: ['es'],
      // The app's styles (its components and styles/platform.css), as @vexoulz/vods-core/app.css.
      cssFileName: 'app',
    },
    // The site provides these, so it has one copy of each: vue's reactivity, the router and the shared UI are
    // singletons. vite and node:* are only for the dev entry, which runs in the site's vite config.
    rollupOptions: { external: ['vue', 'vue-router', 'vite', /^node:/, /^@vexoulz\/(ui|platform-web)(\/|$)/] },
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})

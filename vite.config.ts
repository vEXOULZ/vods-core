import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: { index: 'src/index.ts', vue: 'src/vue/index.ts' },
      formats: ['es'],
    },
    rollupOptions: { external: ['vue', /^@vexoulz\/platform-web/] },
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})

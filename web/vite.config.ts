import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: {
    transformer: 'postcss',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    cssMinify: 'esbuild', // 使用 esbuild 压缩 CSS，避免 lightningcss 警告
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React 核心库
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }

            // Radix UI (shadcn/ui 底层)
            if (id.includes('@radix-ui')) {
              return 'radix-ui';
            }

            // 图表库
            if (id.includes('recharts')) {
              return 'charts';
            }

            // 图标库
            if (id.includes('lucide-react')) {
              return 'icons';
            }

            // 动画库 (Radix UI 依赖)
            if (id.includes('framer-motion')) {
              return 'animations';
            }

            // 工具库
            if (id.includes('date-fns') || id.includes('clsx') || id.includes('class-variance-authority')) {
              return 'utils';
            }
          }
        }
      }
    },
    // 提高chunk size警告阈值到600KB
    chunkSizeWarningLimit: 600,
  }
})

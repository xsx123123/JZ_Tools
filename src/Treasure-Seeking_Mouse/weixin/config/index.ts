// Taro 编译配置：目标 platforms 目前只有 weapp（微信小程序）
import { defineConfig } from '@tarojs/cli'
import path from 'node:path'

export default defineConfig({
  projectName: 'geo-muse-weixin',
  date: '2026-10-05',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  alias: {
    // 与 tsconfig paths 对齐：@/* → src/*
    '@': path.resolve(__dirname, '..', 'src'),
  },
  cache: {
    enable: false,
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      // 关闭 URL 处理：小程序无外链资源需求
      url: {
        enable: true,
        config: { limit: 1024 },
      },
      cssModules: {
        enable: false,
      },
    },
  },
})

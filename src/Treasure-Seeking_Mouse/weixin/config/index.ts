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
  defineConstants: {
    // 对话服务地址：构建期注入，避免改源码。正式部署：
    //   CHAT_API=https://cygnusx.icu/chat-api npm run build:weapp
    'process.env.CHAT_API': JSON.stringify(process.env.CHAT_API || 'https://YOUR_DOMAIN/chat-api'),
    // 可选：与后端 CHAT_SHARED_SECRET 配套的防刷密钥（后端未配置鉴权时留空即可，不影响请求）
    'process.env.CHAT_SHARED_SECRET': JSON.stringify(process.env.CHAT_SHARED_SECRET || ''),
  },
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

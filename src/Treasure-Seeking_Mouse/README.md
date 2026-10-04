# GEO寻宝鼠 · 对话式组学数据检索助手

> 🚀 **在线体验**：<https://q1vj9sqopzwj.meoo.fun/>（线上部署版本可能落后于仓库最新代码）

一个把 [seqout-mcp](https://seqout.org) 的 26 个只读组学数据检索工具封装成「聊天式挖宝」体验的单页 Web 应用：用户用自然语言提问，后端大模型自动选择并调用 seqout API，结果以数据卡片 + 可折叠建议卡呈现；页面右下角常驻一只「寻宝鼠」桌宠，随检索进度挖宝、攒宝藏、解锁成就。支持移动端自适应，可完全脱离平台自托管（任意 OpenAI 兼容模型 + Docker 一键部署）。

![封面 · 夜探矿洞](docs/寻宝鼠.png)

**界面预览**（自托管模式 + DeepSeek 模型，纯游客运行）：

![使用界面](docs/使用页面.png)

---

## 快速开始

### Docker 部署（推荐，无需本机 Node/pnpm/nginx）

```bash
cp server/.env.example server/.env   # 填入 LLM_API_KEY（OpenAI / DeepSeek / 硅基流动 / 本地 vLLM 均可）
make docker-start                    # 预检密钥 → 构建 → 启动
```

打开 `http://localhost:8080/`（端口由 `server/.env` 的 `WEB_PORT` 控制），发一条消息能看到流式回复即成功。常用命令：`make docker-stop` / `make docker-restart` / `make docker-logs`（`make` 查看全部）。

### 本地开发

```bash
pnpm install
pnpm run server    # 本地对话服务（读 server/.env 的密钥与端口）
pnpm run dev       # 前端 dev server（固定 3015 端口）
```

环境变量唯一来源是 `server/.env`：本地开发与 Docker 部署共用（vite `envDir` 指向 `server/`，Makefile 起容器带 `--env-file server/.env`），`VITE_*` 构建期变量与 `LLM_*`/`WEB_PORT` 等运行时变量都写在这一份里。

## 功能一览

- **对话式检索**：自然语言提问 → LLM tool-calling 自动选择 seqout 工具（26 个只读工具，GEO/SRA/ENA/GSA）→ 流式回答 + 数据卡片 + 「下一铲建议」
- **正文内嵌链接**：GSE/GSM/GO/PMID 编号自动变成可点链接，hover 浮层预取论文元数据，一键查看文献证据链（PubMed 摘要 + DOI / OA 全文）
- **排行榜**：登录用户榜 + 访客榜，本周 / 累计双维度，自定义昵称
- **使用统计**：顶栏 📊 面板展示累计对话、Token 消耗、使用人数、每个工具的调用次数（服务端聚合，容器内持久化）
- **桌宠与成就**：寻宝鼠随检索进度挖宝，累计挖宝解锁成就徽章
- **移动端自适应**：软键盘、安全区、触摸交互全适配

## 技术栈

React 19 + TypeScript · Vite 7 · Tailwind CSS v4（双主题 design token）· TanStack Router · Supabase 兼容后端（可选，不配自动降级纯游客模式）· 任意 OpenAI 兼容 LLM 网关 · Docker Compose（nginx + Node 双容器）

## 目录

| 位置 | 内容 |
|------|------|
| `docs/DETAILED_README.md` | **详细开发文档**：目录结构、核心架构与数据流、平台部署（Meoo）、手动部署、systemd、踩坑清单 |
| `src/routes/about.tsx` | 应用内「关于」页（产品介绍） |
| `deploy/` | Docker 部署（Dockerfile 双 target + compose + nginx + Makefile） |
| `server/` | 自托管对话服务（Node 原生跑 Edge Function 的 handler，零依赖） |

详细架构说明、Meoo 平台发布流程、手动部署步骤与常见问题排查，请见 **[docs/DETAILED_README.md](docs/DETAILED_README.md)**。

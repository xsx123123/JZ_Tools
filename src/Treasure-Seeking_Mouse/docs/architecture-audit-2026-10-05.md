# 架构合规性审计报告

> 审计日期：2026-10-05
> 审计对象：`src/Treasure-Seeking_Mouse/`（Web 版后端 + 编排层）与 `src/Treasure-Seeking_Mouse/weixin/`（微信小程序版前端）
> 目标架构：微信小程序 + Node 编排代理 + 大模型 Agent（Function Calling 检索组学库）
> 预期域名：`https://cygnusx.icu/chat-api`

## 一、符合度概览

| # | 架构指标 | 状态 | 位置 |
|---|---|---|---|
| 1 | 小程序请求 `https://cygnusx.icu/chat-api` | ⚠️ 部分实现 | `weixin/src/services/seqoutChat.ts:16-19` |
| 2 | 前端流式接收 enableChunked/onChunkReceived | ✅ 已实现 | `seqoutChat.ts:120-163` |
| 3 | ArrayBuffer UTF-8 解码 + 增量拼接 | ✅ 已实现 | `weixin/src/services/sseParse.ts:41-91` |
| 4 | 前端无 LLM Key 泄露 | ✅ 合规 | 全前端仅 `X-Stats-Actor` 设备指纹 |
| 5 | Node 服务监听本地端口、可被 Nginx 反代 | ✅ 已实现（有加固建议） | `server/local.mjs:105` |
| 6 | SSE 响应头规范 | ⚠️ 部分实现 | `functions/seqout-chat/index.ts:876` |
| 7 | Nginx 关缓冲 + 超时 + 路径前缀匹配 | ✅ 已实现（容器内 80 端口） | `deploy/nginx.docker.conf:25-41` |
| 8 | 443/TLS 终结配置 | ❌ 缺失 | 仓库无任何 TLS 配置 |
| 9 | 26 个工具 Function Schema | ✅ 已实现 | `index.ts:172-203` |
| 10 | ReAct 循环：tool_calls → seqout 执行 → role:tool 回传 | ✅ 已实现 | `index.ts:772-862` |
| 11 | 用量统计 + 持久化 | ✅ 已实现（有平台差异） | `index.ts:76-164` + `local.mjs:34-52` |
| 12 | 接口鉴权 / 防滥用 | ❌ 缺失 | `/chat-api` 完全开放 |

## 二、分维度详细发现

### 1. 前端微信小程序

**✅ 合规项**

- 流式三件套齐全且用法正确：`enableChunked: true` + `responseType: "arraybuffer"` + `task.onChunkReceived`（`seqoutChat.ts:120-163`），并保留了 success 兜底（基础库不触发 onChunkReceived 时整块喂解析器）。
- SSE 解析器是纯函数，跨 chunk 半帧、心跳（`: ping`）、`[DONE]`、flush 冲刷都处理正确（`sseParse.ts:78-89`），且已被 10 case Node harness（`weixin/scripts/verify-stream.mjs`）覆盖。
- 前端无任何 LLM Key，连 Authorization 头都没有——Key 完全留在服务端，符合"密钥不下发"原则。

**⚠️ 问题 1：域名是写死的占位符，且不可配置**（`seqoutChat.ts:16-19`）

```ts
const CHAT_API = "";
function chatEndpoint(): string {
  return CHAT_API || "https://YOUR_DOMAIN/chat-api";
}
```

这不是环境变量驱动的，R3 换域名要改源码重新打包。建议用 Taro defineConstants 注入（补丁见第三节 A）。

**⚠️ 问题 2：success 与 onChunkReceived 可能双份喂数据**（`seqoutChat.ts:128-141, 157-163`）。如果某个基础库版本既触发分块回调、success 的 `res.data` 又含完整 body，`delta` 会渲染两遍。概率低但防御成本极低（补丁见第三节 B）。

**⚠️ 问题 3：打字机渲染无节流**（`weixin/src/pages/index/index.tsx` 的 `onDelta`）。每个 SSE delta 触发一次 `setMessages` 全量重渲染 + 整条 Markdown 重解析，长回答在低端真机上会明显掉帧。建议 50ms 批量 flush（补丁见第三节 C）。

**📋 上线手续提醒（代码外）**：备案完成后，还需在微信小程序后台「开发管理 → 服务器域名」把 `https://cygnusx.icu` 加进 request 合法域名，否则真机全被拦。

### 2. 服务端架构与协议

**✅ 合规项**

- `server/local.mjs` 零第三方依赖（Node 原生 http + 环境变量自解析），`MAX_BODY` 1MB 上限防内存打满（`:61-78`），客户端断连通过 `res.on('close') → AbortController` 中止 handler（`:66`）。
- SSE 响应 `Content-Type: text/event-stream` + `Cache-Control: no-cache`（`index.ts:876`），另有 10s 心跳注释行防代理缓冲（`:763-766`）——这是流式链路里最专业的一环。
- Nginx 侧 `proxy_buffering off` + `proxy_read_timeout 600s` + `proxy_http_version 1.1` + `Connection ""` 全部正确（`nginx.docker.conf:25-41`），且 `location = /chat-api` 精确匹配规避了 301 丢端口的坑（注释 `:23-24` 写明了原因）。`/chat-api/stats`、`/chat-api/literature`（实际走 POST body 分流，根路径即可）均能被 `location /chat-api/` 正确剥前缀转发。

**⚠️ 问题 4：LLM 上游请求无超时、无 abort 传递**（`index.ts:775-780`）。`fetch(LLM_BASE_URL/chat/completions)` 没有 `signal`、没有超时。后果有两个：(a) 上游挂死时本轮对话永久挂起（客户端早断了，服务端还在空转）；(b) 客户端断连后 `aborted=true` 只是让 `send()` 变 no-op，`while(reader.read())` 循环和后续 39 轮工具循环**不会停**，继续烧 token 直到 40 轮跑完。补丁见第三节 D。

**⚠️ 问题 5：SSE 响应缺 `X-Accel-Buffering: no`**（`index.ts:876`）。当前 compose 里 nginx 已 `proxy_buffering off` 所以无碍，但如果以后接入其他代理/CDN（很多默认缓冲 SSE），缺这个头会导致打字机效果变"一次性出全文"。一行修复。

**⚠️ 问题 6：监听地址绑定 0.0.0.0**（`server/local.mjs:105`）。compose 场景没问题（`expose` 不发布到宿主机，docker-compose.yml:40-41），但如果改为宿主机裸跑 + 宿主机 nginx，`0.0.0.0:8787` 等于把无鉴权的对话接口直接暴露公网。建议支持 `CHAT_API_HOST` 环境变量（补丁见第三节 D）。

**❌ 问题 7：443/TLS 配置缺失**。仓库里只有容器内 `listen 80` 的 nginx 配置，cygnusx.icu 上线必须的 443 server 块、证书、HTTP→HTTPS 跳转全都要新写。给出可直接用的宿主机 nginx 配置（第三节 E）。

### 3. Agent 与 Function Calling 编排

**✅ 合规项（这块实现质量很高）**

- `TOOL_DEFS` 恰好 26 个工具（`index.ts:173-198`），格式严格遵循 OpenAI 规范：`{type:'function', function:{name, description, parameters:{type:'object', properties, required}}}`。
- ReAct 循环完整：流式聚合 `tool_calls`（按 `index` 累加 name/arguments，`index.ts:812-821`，处理了流式分片顺序）→ 执行工具（每工具 try/catch，错误也包装成 `{success:false, error}` 结果回传，`:848-857`）→ `role:'tool'` + `tool_call_id` 回传 `:858` → 最多 40 轮并在触顶时给用户可读提示 `:861`。
- 护栏齐全：历史截断 `slice(-16)`（`:745`）、工具结果 `trimForLLM` 10 万字符封顶（`:572-591`）、seqout 请求 25s 超时（`:218`）、数据集卡片从结果提取（`extractCards`）。
- 文献联动（NCBI 限流桶、Europe PMC 降级、进程内 TTL 缓存）设计成熟，与 26 个检索工具解耦（独立 `action:'literature'` 分流，不用 AI 凭证，`:679-696`）。

**⚠️ 问题 8（轻）**：上游 LLM 非 2xx 时只回 `AI 服务返回 ${status}`（`:784`）——用户侧不可自诊，但属于可接受取舍。

### 4. 统计与持久化

**✅ 合规项**

- 内存聚合 chats/llmCalls/双通道 token/tools 明细/actors 去重（按前端上报 `X-Stats-Actor`），`GET /stats` 供前端统计面板（`index.ts:700-705`）。
- 持久化路径正确：每 15s 有变化才写盘，**tmp + rename 原子落盘**防写一半（`local.mjs:42-52`），启动时 `restoreUsageStats` 恢复（`:37-40`），Docker 命名卷保证容器重建不丢（`docker-compose.yml:36-39, 69-71`）。单线程事件循环下无并发写冲突。
- 内存泄漏有护栏：actors 上限 2 万（`index.ts:74`）、文献缓存 2000 条 LRU 式淘汰（`:336-342`）、`setInterval(...).unref()` 不挡退出（`local.mjs:52`）。

**⚠️ 问题 9（平台差异，非 bug）**：Meoo/Deno 平台无文件系统，统计仅内存、重启归零（代码注释已如实说明，`:48-49`）。自托管 Node 路径无此问题。

## 三、修复补丁

### A. 域名可配置（`weixin/config/index.ts`）

```ts
// config/index.ts 的 config 对象里加：
defineConstants: {
  'process.env.CHAT_API': JSON.stringify(process.env.CHAT_API || 'https://YOUR_DOMAIN/chat-api'),
},
```

```ts
// seqoutChat.ts:16-19 改为：
const CHAT_API: string = process.env.CHAT_API || "";
function chatEndpoint(): string {
  return CHAT_API || "https://YOUR_DOMAIN/chat-api";
}
```

构建时 `CHAT_API=https://cygnusx.icu/chat-api npm run build:weapp` 即可，dev/prod 不用改源码。

### B. 防双份喂数据（`seqoutChat.ts`）

```ts
const task = Taro.request({
  // ...
  success: (res) => {
    const data = (res as unknown as { data?: unknown })?.data;
    if (!gotChunk && data instanceof ArrayBuffer) {   // 收到过 onChunkReceived 就跳过
      try { parser.push(data); } catch { /* ignore */ }
    }
    parser.flush();
    done();
  },
});
let gotChunk = false;
task.onChunkReceived((res) => {
  gotChunk = true;
  try { parser.push(res.data); } catch { /* ignore */ }
});
```

### C. delta 节流（`weixin/src/pages/index/index.tsx`）

```ts
// handleSend 内：把逐条 patch 改成 50ms 批量 flush
let pending = '';
const flushTimer = setInterval(() => {
  if (!pending) return;
  const d = pending; pending = '';
  patch((m) => ({ ...m, content: m.content + d }));
}, 50);
// onDelta: (d) => { pending += d; }
// requestSeqoutChat resolve 后：clearInterval(flushTimer) + 最后一次 flush
```

### D. 服务端加固（`functions/seqout-chat/index.ts` + `server/local.mjs`）

```ts
// index.ts:775 附近 —— LLM fetch 接信号 + 90s 超时，循环内检查 aborted
const llmResp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
  method: 'POST',
  signal: AbortSignal.any ? AbortSignal.any([req.signal, AbortSignal.timeout(90_000)]) : req.signal,
  headers: { Authorization: `Bearer ${projectServiceAK}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true }, tools: TOOL_DEFS, tool_choice: 'auto' }),
});
// while (true) { const {done, value} = await reader.read(); if (aborted) break; ... }   // 读循环加 aborted 检查
// for (let round = 0; round < 40 && !aborted; round++)                                  // 轮循环加 aborted 检查
```

```ts
// index.ts:876 —— SSE 头补一个
return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } });
```

```js
// local.mjs:105 —— 监听地址可配（compose 场景加 environment: CHAT_API_HOST: "0.0.0.0"）
const HOST = process.env.CHAT_API_HOST || '127.0.0.1';
}).listen(PORT, HOST, () => {
```

### E. 宿主机 443 Nginx（新文件，如 `deploy/nginx.host.conf`）

这是 cygnusx.icu 真正缺的那块，certbot 或云厂商证书就位后使用：

```nginx
limit_req_zone $binary_remote_addr zone=chatapi:10m rate=10r/m;   # 防刷：每 IP 每分钟 10 次对话

server {
    listen 80;
    server_name cygnusx.icu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name cygnusx.icu;
    ssl_certificate     /etc/letsencrypt/live/cygnusx.icu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cygnusx.icu/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;        # Web 版（可选）
        proxy_set_header Host $host;
    }

    location = /chat-api {
        limit_req zone=chatapi burst=5 nodelay;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
    location /chat-api/ {
        limit_req zone=chatapi burst=5 nodelay;
        proxy_pass http://127.0.0.1:8787/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 600s;
    }
}
```

（若保留 compose 拓扑不裸跑，则把 `127.0.0.1:8787` 换成 `127.0.0.1:宿主机映射端口`，并把 web 的 `ports: "8080:80"` 保持只绑 `127.0.0.1:8080:80`。）

### F. 接口防滥用（可选但强烈建议）

`/chat-api` 目前任何人发现域名就能 POST 烧 LLM 额度。低成本方案：共享密钥头。

```ts
// index.ts handler 开头（credentials 检查之后）：
const shared = envGet('CHAT_SHARED_SECRET');
if (shared && req.headers.get('X-Chat-Key') !== shared) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
}
```

```ts
// seqoutChat.ts headers() 里加一行（key 值构建期经 defineConstants 注入，与 A 同款）：
"X-Chat-Key": process.env.CHAT_SHARED_SECRET || "",
```

说明：小程序包可被反编译提取密钥，这只能挡住爬虫和 casual 滥用，挡不住有心人——彻底方案是后续接 wx.login + 后端按 openid 限配额，但那是上架后的迭代项，不阻塞上线。

## 四、结论

**架构骨架与目标设计完全吻合**：三层职责清晰，26 个工具的 Function Calling 编排、ReAct 循环、SSE 流式、心跳、统计持久化都实现到位且质量高于平均水平。**没有阻断性缺陷**，阻塞上线的只有两件代码外的事：备案和微信后台合法域名配置。代码层建议在部署前落地的是：**D（超时/断连止血，防烧 token）、E（443 配置）、F（防刷）** 三个；A/B/C 是体验与健壮性优化，可与上架并行。

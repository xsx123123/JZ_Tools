#!/usr/bin/env python3
"""LLM API 密钥预检：启动容器前验证 server/.env 里的配置是否真的可用。

在 `make docker-start` 里于 compose 之前运行，避免"容器起来了但一对话就报错"
（错误凭证/不可达地址/模型不存在，都要等用户发消息才暴露）。

退出码：
  0  预检通过（或 --soft 模式下告警但放行）
  1  配置缺失/密钥无效/服务不可达 → 阻止启动

用法：
  python3 deploy/check-llm-key.py                     # 读 server/.env
  python3 deploy/check-llm-key.py --env-file path     # 指定 env 文件
  python3 deploy/check-llm-key.py --soft              # 失败仅告警，不阻断（返回 0）
  python3 deploy/check-llm-key.py --timeout 15
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_ENV_FILE = "server/.env"
DEFAULT_TIMEOUT = 20

# 视为"未填写"的占位符（.env.example 里的原样值）
PLACEHOLDER_RE = re.compile(r"^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$|^sk-xxx$|^$")


def log(msg: str) -> None:
    print(msg, flush=True)


def ok(msg: str) -> None:
    log(f"  \033[32m✓\033[0m {msg}")


def warn(msg: str) -> None:
    log(f"  \033[33m!\033[0m {msg}")


def fail(msg: str) -> None:
    log(f"  \033[31m✗\033[0m {msg}")


def load_env_file(path: str) -> tuple[dict[str, str], dict[str, str]]:
    """极简 KEY=VALUE 解析（与 server/local.mjs 的实现保持一致）。

    - 忽略空行与 # 注释
    - 自动去引号
    - 支持 $VAR / ${VAR} 引用进程环境变量

    返回 (解析后的 env, 原文 env)；原文用于判断某值是否为引用式写法。
    """
    env: dict[str, str] = {}
    raw: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            eq = line.find("=")
            if eq < 1:
                continue
            key = line[:eq].strip()
            val = line[eq + 1:].strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            raw[key] = val
            env[key] = re.sub(
                r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?",
                lambda m: os.environ.get(m.group(1), ""),
                val,
            )
    return env, raw


def check(base_url: str, api_key: str, model: str | None, timeout: int) -> tuple[bool, str]:
    """请求 {base}/models 验证密钥。返回 (是否通过, 说明)。"""
    url = base_url.rstrip("/") + "/models"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300] if e.fp else ""
        if e.code in (401, 403):
            return False, f"密钥被拒绝（HTTP {e.code}）：{detail or '密钥无效或无权限'}"
        return False, f"服务返回 HTTP {e.code}：{detail}"
    except urllib.error.URLError as e:
        return False, f"无法连接 {url}：{e.reason}"
    except Exception as e:  # noqa: BLE001 - 预检脚本，任何异常都归为不可用
        return False, f"请求异常：{e}"

    # 解析模型列表，顺带校验 LLM_MODEL 是否真实存在
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return False, f"响应不是合法 JSON（{url} 可能不是 OpenAI 兼容端点）"

    ids: list[str] = []
    if isinstance(data.get("data"), list):  # 标准 OpenAI 形态
        ids = [m["id"] for m in data["data"] if isinstance(m, dict) and "id" in m]
    elif isinstance(data.get("models"), list):  # Meoo 网关形态
        ids = list(data["models"])

    if model and ids and model not in ids:
        return False, f"模型 '{model}' 不在该网关的模型列表中（共 {len(ids)} 个）"
    if model and not ids:
        warn(f"无法确认模型 '{model}' 是否存在（端点未返回模型列表）")

    return True, f"可用（{len(ids)} 个模型）" if ids else "可用"


def main() -> int:
    ap = argparse.ArgumentParser(description="LLM API 密钥预检")
    ap.add_argument("--env-file", default=DEFAULT_ENV_FILE, help="env 文件路径")
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help="请求超时秒数")
    ap.add_argument("--soft", action="store_true", help="失败仅告警，不阻断启动")
    args = ap.parse_args()

    log("🔍 检查 LLM 配置…")

    if not os.path.isfile(args.env_file):
        fail(f"找不到 {args.env_file}")
        log(f"   请先执行：cp server/.env.example {args.env_file} 并填入 LLM_API_KEY")
        return 0 if args.soft else 1

    env, raw = load_env_file(args.env_file)
    api_key = env.get("LLM_API_KEY", "").strip()
    raw_key = raw.get("LLM_API_KEY", "").strip()
    base_url = env.get("LLM_BASE_URL", "").strip() or "https://api.meoo.host/meoo-ai/compatible-mode/v1"
    model = env.get("LLM_MODEL", "").strip() or None

    if PLACEHOLDER_RE.match(api_key):
        fail("LLM_API_KEY 未填写（仍是占位符或空值）")
        if raw_key.startswith("$"):
            name = raw_key.strip("${} ")
            log(f"   该文件用的是引用式写法 {raw_key}，需先设置 shell 环境变量：")
            log(f"     export {name}=sk-你的密钥")
            log(f"   或直接在 {args.env_file} 中填明文 LLM_API_KEY=sk-...")
        else:
            log(f"   请在 {args.env_file} 中填写 LLM_API_KEY")
        return 0 if args.soft else 1
    ok(f"LLM_API_KEY 已填写（{api_key[:6]}…{api_key[-4:]}，长度 {len(api_key)}）")
    ok(f"LLM_BASE_URL = {base_url}")
    if model:
        ok(f"LLM_MODEL = {model}")
    else:
        warn("LLM_MODEL 未设置（将由服务端默认值兜底）")

    passed, detail = check(base_url, api_key, model, args.timeout)
    if passed:
        ok(detail)
        log("\033[32m✅ LLM 配置检查通过\033[0m")
        return 0

    fail(detail)
    log("")
    log("  排查建议：")
    log("   - 401/403：密钥无效，检查 LLM_API_KEY（注意 shell 环境变量是否已 export）")
    log("   - 404：LLM_BASE_URL 可能缺少 /v1 后缀，或该端点非 OpenAI 兼容")
    log("   - 连接失败：网络不通，或需要代理")
    log(f"   - 模型不存在：改 LLM_MODEL 为上面报错信息里网关支持的 id")
    if args.soft:
        log("\033[33m⚠️  预检未通过，但 --soft 模式继续启动\033[0m")
        return 0
    log("\033[31m❌ LLM 配置检查未通过，已阻止启动\033[0m")
    log("   如确需跳过检查：make docker-start SKIP_LLM_CHECK=1")
    return 1


if __name__ == "__main__":
    sys.exit(main())

# GEO寻宝鼠 · 快捷命令
#
# 配置唯一来源：server/.env（本地 `pnpm run server` 与容器共用同一份，无需重复维护）
# 首次使用：cp server/.env.example server/.env && 填入 LLM_API_KEY
#
# 常用：
#   make docker-start    预检 LLM 密钥 → 构建并启动容器
#   make docker-logs     跟踪对话服务日志
#   make docker-stop     停止容器
#
# 端口：默认 10087（server/.env 的 WEB_PORT 覆盖；按服务器实际可用端口配置）
# 一键启动前会自动检测该端口是否被其他进程占用，占用即报错停止

SHELL := /bin/bash

COMPOSE   := docker compose -f deploy/docker-compose.yml
ENV_FILE  := server/.env
PORT      ?= 10087
PYTHON    ?= python3
CHECK_LLM := deploy/check-llm-key.py

# 从 server/.env 读 WEB_PORT（缺省 10087）；导出为环境变量，覆盖 compose 插值里的默认值
WEB_PORT := $(shell grep -E '^WEB_PORT=' $(ENV_FILE) 2>/dev/null | cut -d= -f2 | tr -d ' ')
ifeq ($(WEB_PORT),)
WEB_PORT := $(PORT)
endif
export WEB_PORT

.DEFAULT_GOAL := help
.PHONY: help docker-start docker-stop docker-restart docker-logs docker-status docker-clean check-env check-llm check-port

help: ## 显示所有可用命令
	@echo "GEO寻宝鼠 · 可用命令："
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "访问地址：http://localhost:$(WEB_PORT)/"

check-env: ## （内部）校验 server/.env 存在
	@test -f $(ENV_FILE) || { \
		echo "❌ 缺少 $(ENV_FILE)"; \
		echo "   请先执行：cp server/.env.example $(ENV_FILE)"; \
		echo "   然后填入 LLM_API_KEY 等配置"; \
		exit 1; \
	}

check-llm: check-env ## 预检 LLM 密钥是否可用（启动前自动执行；SKIP_LLM_CHECK=1 可跳过）
ifdef SKIP_LLM_CHECK
	@echo "⏭  已跳过 LLM 预检（SKIP_LLM_CHECK=1）"
else
	@$(PYTHON) $(CHECK_LLM) --env-file $(ENV_FILE)
endif

check-port: check-env ## 预检 WEB_PORT 是否被其他进程占用（被占即报错停止；本项目容器自身占用除外）
	@WP="$(WEB_PORT)"; \
	if ss -tln 2>/dev/null | awk '{print $$4}' | grep -qE ":$${WP}$$"; then \
	  PUB=$$($(COMPOSE) --env-file $(ENV_FILE) port web 80 2>/dev/null | cut -d: -f2); \
	  if [ "$$PUB" = "$$WP" ]; then \
	    echo "✓ 端口 $$WP 由本项目 web 容器占用（重启场景，继续）"; \
	  else \
	    echo "❌ 端口 $$WP 已被其他进程占用，启动已中止"; \
	    echo "   → 释放该端口，或在 $(ENV_FILE) 里把 WEB_PORT 改为服务器上实际可用的端口"; \
	    exit 1; \
	  fi; \
	else \
	  echo "✓ 端口 $$WP 可用"; \
	fi

docker-start: check-llm check-port ## 预检 LLM 密钥 + 端口占用 → 构建并启动容器（后台运行）
	@echo ""
	$(COMPOSE) --env-file $(ENV_FILE) up -d --build
	@echo ""
	@echo "✅ 已启动，访问 http://localhost:$(WEB_PORT)/"
	@echo "   查看日志：make docker-logs"

docker-stop: ## 停止并移除容器
	$(COMPOSE) down

docker-restart: ## 重启容器（不重新构建，读取 server/.env 最新值）
	$(COMPOSE) --env-file $(ENV_FILE) up -d
	@echo "✅ 已重启（改了 VITE_* 构建期变量需改用 make docker-start 重新构建）"

docker-logs: ## 跟踪对话服务日志（Ctrl+C 退出）
	$(COMPOSE) logs -f chat

docker-status: ## 查看容器与健康状态
	$(COMPOSE) ps

docker-clean: ## 停止容器并删除镜像（彻底清理后重来）
	$(COMPOSE) down --rmi local

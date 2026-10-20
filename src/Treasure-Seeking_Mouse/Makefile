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

# 启动日志配色（NO_COLOR=1 可关闭，便于 CI 或日志采集）
ifeq ($(NO_COLOR),1)
RESET :=
BOLD :=
CYAN :=
GREEN :=
YELLOW :=
RED :=
DIM :=
else
RESET := \033[0m
BOLD := \033[1m
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
DIM := \033[2m
endif

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
	@printf "\n$(BOLD)$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n"
	@printf "$(BOLD)$(CYAN)  GEO 寻宝鼠 · Docker 启动$(RESET)\n"
	@printf "$(DIM)  配置: $(ENV_FILE)  |  Web 端口: $(WEB_PORT)$(RESET)\n"
	@printf "$(BOLD)$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n\n"
	@printf "$(BOLD)$(CYAN)[1/4]$(RESET) 构建并启动服务…\n"
	@START=$$(date +%s); \
	$(COMPOSE) --env-file $(ENV_FILE) up -d --build; \
	ELAPSED=$$(( $$(date +%s) - START )); \
	printf "\n$(GREEN)✓$(RESET) 构建与启动完成（用时 $${ELAPSED}s）\n"
	@printf "\n$(BOLD)$(CYAN)[2/4]$(RESET) 容器状态\n"
	@$(COMPOSE) --env-file $(ENV_FILE) ps --format 'table {{.Name}}\t{{.Service}}\t{{.State}}\t{{.Ports}}'
	@printf "\n$(BOLD)$(CYAN)[3/4]$(RESET) Web 健康检查\n"
	@URL="http://localhost:$(WEB_PORT)/"; \
	if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 5 -o /dev/null "$$URL"; then \
	  printf "$(GREEN)✓$(RESET) $$URL 响应正常\n"; \
	else \
	  printf "$(YELLOW)!$(RESET) 暂未收到 $$URL 响应（容器可能仍在启动）\n"; \
	  printf "  可稍后运行: make docker-status\n"; \
	fi
	@printf "\n$(BOLD)$(CYAN)[4/4]$(RESET) 使用入口\n"
	@printf "  $(GREEN)Web$(RESET)    http://localhost:$(WEB_PORT)/\n"
	@printf "  $(DIM)日志$(RESET)   make docker-logs\n"
	@printf "  $(DIM)状态$(RESET)   make docker-status\n"
	@printf "  $(DIM)停止$(RESET)   make docker-stop\n\n"
	@printf "$(BOLD)$(GREEN)✓ 启动流程完成$(RESET)\n"

docker-stop: ## 停止并移除容器
	$(COMPOSE) down

docker-restart: ## 重启容器（不重新构建，读取 server/.env 最新值）
	@printf "$(BOLD)$(CYAN)⟳ 重启 GEO 寻宝鼠容器…$(RESET)\n"
	@$(COMPOSE) --env-file $(ENV_FILE) up -d
	@$(COMPOSE) --env-file $(ENV_FILE) ps --format 'table {{.Name}}\t{{.Service}}\t{{.State}}\t{{.Ports}}'
	@printf "$(GREEN)✓$(RESET) 已重启，访问 http://localhost:$(WEB_PORT)/\n"
	@printf "$(DIM)提示：修改 VITE_* 构建期变量后请使用 make docker-start 重新构建。$(RESET)\n"

docker-logs: ## 跟踪对话服务日志（Ctrl+C 退出）
	$(COMPOSE) logs -f chat

docker-status: ## 查看容器与健康状态
	$(COMPOSE) ps

docker-clean: ## 停止容器并删除镜像（彻底清理后重来）
	$(COMPOSE) down --rmi local

# seqout-mcp

公共数据库检索 MCP Server — 完整覆盖 [seqout.org](https://seqout.org) API 的 26 个只读工具（GEO/SRA/ENA/GSA 搜索、项目详情、样本清单、GSM/SRR/PRJNA 编号反查、本体论查询、统计、下载链接）。

源自 CygnusX 平台（`OmicHub/mcp-server/tools/seqout.py`）的独立剥离版，仅依赖 `fastmcp` + `httpx`，stdio 传输，无需鉴权。

## 文件

- `seqout_mcp.py` — 单文件 MCP 服务器（全部 26 个工具）
- `SKILL.md` — Agent skill 文档（安装配置、工具清单、调用流程）

## 快速启动

```bash
# MCP 客户端配置（以 uvx 方式零安装运行）
{
  "mcpServers": {
    "seqout": {
      "command": "uv",
      "args": ["run", "--with", "fastmcp", "--with", "httpx",
               "/home/zj/zj_code_libarary/jz_tools/src/seqout-mcp/seqout_mcp.py"]
    }
  }
}
```

命令行自检（列出 26 个工具）：

```bash
cd /home/zj/zj_code_libarary/jz_tools/src/seqout-mcp
uv run --with fastmcp --with httpx python -c "
import asyncio
import importlib.util
spec = importlib.util.spec_from_file_location('seqout_mcp', 'seqout_mcp.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
tools = asyncio.run(mod.mcp._list_tools())
print(len(tools), [t.name for t in tools])
"
```

详细工具说明与典型调用流程见 [SKILL.md](./SKILL.md)。

# Data Deliver (数据交付工具)

`data_deliver` 是一个高性能的 Rust 命令行工具，专为生物信息学数据交付和大规模文件传输设计。它支持本地文件的高效处理（复制/硬链/软链）以及向火山引擎 TOS (S3 兼容对象存储) 的高速并发上传。

## ✨ 核心特性

- **多模式本地交付**：支持 `Copy` (复制)、`Hardlink` (硬链接)、`Symlink` (软链接) 三种模式，适应不同磁盘空间需求。
- **高速云端上传**：
    - 基于火山引擎 TOS SDK 开发。
    - 支持多文件并发上传与断点续传（自动分片）。
    - **实时进度监控**：提供字节级上传速度、剩余时间预估以及总体任务进度。
- **便捷配置管理**：新增 `config` 子命令，支持加密存储 AK/SK 及常用环境配置 (`~/.data_deliver/config.yaml`)，简化日常调用。
- **灵活过滤**：支持通过正则表达式 (`--regex`) 筛选需要处理的文件（仅匹配文件名）。
- **数据完整性校验**：自动计算并输出文件的 MD5 校验和。
- **可观测性**：详细的日志记录（本地及云端上传日志）和漂亮的终端统计报表。

## 🚀 安装与构建

确保您的环境中已安装 Rust 工具链 (Cargo)。

```bash
# 编译 Release 版本 (推荐)
cargo build --release

# 编译完成后，二进制文件位于 target/release/data_deliver
cp target/release/data_deliver /usr/local/bin/  # 可选：添加到 PATH
```

## 📖 使用指南

工具包含三个子命令：`local` (本地交付)、`cloud` (云端上传) 和 `config` (环境配置)。

### 1. Config 模式 (环境配置)

建议首次使用前配置默认环境，配置信息（包括 AK/SK）将经过加密处理后存储在 `~/.data_deliver/config.yaml` 中。

```bash
data_deliver config --endpoint <URL> --region <REGION> [OPTIONS]
```

**参数说明：**

| 参数 | 说明 | 是否必填 |
|------|------|----------|
| `--endpoint` | TOS 服务端点 (如 `https://tos-cn-beijing.volces.com`) | 是 |
| `--region` | 存储桶区域 (如 `cn-beijing`) | 是 |
| `--ak` | Access Key ID | 否 (建议设置) |
| `--sk` | Secret Access Key | 否 (建议设置) |

**示例：**

```bash
data_deliver config \
    --endpoint https://tos-cn-beijing.volces.com \
    --region cn-beijing \
    --ak YOUR_ACCESS_KEY \
    --sk YOUR_SECRET_KEY
```

---


### 2. Local 模式 (本地文件处理)

用于将文件从输入目录交付到输出目录，同时生成 MD5 文件。

```bash
data_deliver local [OPTIONS] --input <DIR> --output <DIR> --project-id <ID>
```

**参数说明：**

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--input` | `-i` | 输入文件夹路径 | (必填) |
| `--output` | `-o` | 输出文件夹路径 | (必填) |
| `--project-id` | | 项目ID (用于日志命名等) | (必填) |
| `--mode` | `-m` | 交付模式: `copy`, `hardlink`, `symlink` | `copy` |
| `--regex` | | 正则表达式过滤文件名 | 无 (处理所有文件) |
| `--threads` | `-t` | 并发线程数 | 自动检测 |
| `--debug` | | 开启调试日志 | false |

**示例：**

```bash
# 使用硬链接模式快速交付，仅处理 .fq.gz 文件
data_deliver local \
    -i /data/raw_data \
    -o /data/delivery/project_001 \
    --project-id PROJECT_001 \
    --mode hardlink \
    --regex ".*\.fq\.gz$"
```

---


### 3. Cloud 模式 (上传至 TOS)

用于将文件上传到火山引擎 TOS 对象存储。

**参数加载优先级**：
1. 命令行参数 (`--ak`, `--endpoint` 等)
2. 环境变量 (`TOS_ACCESS_KEY` 等)
3. 配置文件 (`~/.data_deliver/config.yaml`)

*如果以上途径均未获取到必要参数（如 Endpoint 或 AK/SK），程序将报错退出。*

```bash
data_deliver cloud [OPTIONS] --input <DIR> --bucket <BUCKET> --project-id <ID>
```

**参数说明：**

| 参数 | 简写 | 说明 | 备注 |
|------|------|------|------|
| `--input` | `-i` | 输入文件夹路径 | (必填) |
| `--bucket` | | 目标 Bucket 名称 | (必填) |
| `--project-id` | | 项目ID | (必填) |
| `--prefix` | | 对象存储路径前缀 (文件夹) | 默认为空 |
| `--regex` | | 正则表达式过滤文件名 | 默认为空 (上传所有) |
| `--endpoint` | | TOS Endpoint | 优先读取 Config |
| `--region` | | TOS 区域 | 优先读取 Config |
| `--ak` | | Access Key | 优先读取 Config |
| `--sk` | | Secret Key | 优先读取 Config |
| `--part-size` | | 分片大小 (MB) | 默认 20 |
| `--task-num` | | 单文件内部并发分片上传数 | 默认 3 |
| `--meta` | | 自定义元数据 (key:value;k2:v2) | 

**示例：**

```bash
# 假设已运行过 config 命令配置了 AK/SK 和 Endpoint
data_deliver cloud \
    -i /data/delivery/project_001 \
    --bucket my-bio-data \
    --prefix "2024/PROJECT_001/" \
    --project-id PROJECT_001 \
    --regex ".*\.bam$"
```

## 📊 输出结果

- **日志文件**：
  - 本地模式日志保存于输出目录。
  - 云端模式日志保存于当前目录（或 `--log-dir` 指定目录），并会自动上传一份到 OSS 对应路径下。
- **校验文件**：
  - 本地模式会在目标文件同级目录下生成 `.md5` 文件。
  - 云端模式会将 MD5 写入对象元数据 (`content-md5`)。

## 📄 License

**仅供个人及学术研究使用，严禁任何形式的商业用途。**

本项目采用自定义非商业许可协议。如需商业授权，请联系作者。
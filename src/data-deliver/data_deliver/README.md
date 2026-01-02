# Data Deliver (数据交付工具)

`data_deliver` 是一个高性能的 Rust 命令行工具，专为生物信息学数据交付和大规模文件传输设计。它支持本地文件的高效处理（复制/硬链/软链）以及向火山引擎 TOS (S3 兼容对象存储) 的高速并发上传。

## ✨ 核心特性

- **多模式本地交付**：支持 `Copy` (复制)、`Hardlink` (硬链接)、`Symlink` (软链接) 三种模式，适应不同磁盘空间需求。
- **高速云端上传**：
    - 基于火山引擎 TOS SDK 开发。
    - 支持多文件并发上传。
    - **大文件自动分片**：内部实现并发分片上传，支持断点续传（通过分片机制）。
    - **实时进度监控**：提供字节级上传速度、剩余时间预估以及总体任务进度 `[Current/Total]`。
- **数据完整性校验**：自动计算并输出文件的 MD5 校验和。
- **灵活过滤**：支持通过正则表达式 (`--regex`) 筛选需要处理的文件。
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

工具包含两个子命令：`local` (本地交付) 和 `cloud` (云端上传)。

### 1. Local 模式 (本地文件处理)

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
| `--threads` | `-t` | 并发线程数 | 自动检测 |
| `--regex` | | 正则表达式过滤文件名 | 无 |
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

### 2. Cloud 模式 (上传至 TOS)

用于将文件上传到火山引擎 TOS 对象存储。

```bash
data_deliver cloud [OPTIONS] --input <DIR> --bucket <BUCKET> --project-id <ID>
```

**环境变量配置 (推荐)：**
为了安全起见，建议通过环境变量设置 AK/SK：
```bash
export TOS_ACCESS_KEY=你的AccessKey
export TOS_SECRET_KEY=你的SecretKey
```

**参数说明：**

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--input` | `-i` | 输入文件夹路径 | (必填) |
| `--bucket` | | 目标 Bucket 名称 | (必填) |
| `--prefix` | | 对象存储路径前缀 (文件夹) | "" |
| `--project-id` | | 项目ID | (必填) |
| `--region` | | TOS 区域 (如 cn-beijing) | `cn-beijing` |
| `--endpoint` | | TOS Endpoint | `https://tos-cn-beijing.volces.com` |
| `--ak` | | Access Key (也可通过环境变量设置) | |
| `--sk` | | Secret Key (也可通过环境变量设置) | |
| `--part-size` | | 分片大小 (MB) | 20 |
| `--task-num` | | 单文件内部并发分片上传数 | 3 |
| `--meta` | | 自定义元数据 (key:value;k2:v2) | |

**示例：**

```bash
# 上传数据到 TOS，指定前缀和并发
data_deliver cloud \
    -i /data/delivery/project_001 \
    --bucket my-bio-data \
    --prefix "2024/PROJECT_001/" \
    --project-id PROJECT_001 \
    --region cn-shanghai \
    --endpoint https://tos-cn-shanghai.volces.com \
    --task-num 5
```

## 📊 输出结果

- **日志文件**：
  - 本地模式日志保存于输出目录。
  - 云端模式日志保存于当前目录（或指定目录），并会自动上传一份到 OSS 对应路径下。
- **校验文件**：
  - 本地模式会在目标文件同级目录下生成 `.md5` 文件。
  - 云端模式会将 MD5 写入对象元数据 (`content_md5`)。

## 🛠️ 开发说明

项目依赖：
- `ve-tos-rust-sdk`: 火山引擎官方 Rust SDK
- `tokio`: 异步运行时
- `rayon`: 并行计算
- `indicatif`: 进度条显示

## 📄 License

MIT

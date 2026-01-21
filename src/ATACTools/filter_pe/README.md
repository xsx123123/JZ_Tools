# ATAC-seq Paired-End Filter (Rust Version)

A high-performance, multi-threaded tool designed to **strictly filter** Paired-End ATAC-seq (or ChIP-seq) data.

This tool is a Rust implementation of complex filtering logic that is difficult to achieve with standard `samtools` one-liners. It ensures that if **one read** of a pair fails quality checks (e.g., wrong orientation, chimeric alignment), **both reads** are discarded to maintain strict paired-end integrity.

## ✨ Key Features

- **🚀 Ultra-Fast**: Written in Rust using `rust-htslib`. 5-10x faster than Pysam/Python scripts.
- **🧵 Multi-threaded I/O**: Utilizes parallel BGZF compression/decompression to maximize throughput.
- **🧹 Strict Filtering**:
    - **Removes Chimeric Reads**: Pairs mapping to different chromosomes.
    - **Removes Improper Orientation**: Reads that are not FR (Forward-Reverse) orientation.
    - **Removes Orphans/Singletons**: If one read is discarded (or missing), its mate is also removed.
- **📊 Detailed Statistics**: Generates a JSON report (`.filter_stats.json`) for downstream QC.
- **🗑️ Traceability**: Optionally save discarded reads to a separate BAM file for debugging.
- **👀 User Friendly**: Features a real-time progress bar and colorful terminal output.

## 🛠️ Installation

### Prerequisites

- **Rust**: Install via [rustup](https://rustup.rs/) (latest stable version).
- **C Compiler** (gcc/clang): Required for compiling `htslib`.

### Build from Source

```bash
# 1. Enter the project directory
cd src/ATACTools/filter_pe  # Or wherever you cloned this repo

# 2. Build the binary (Release mode is recommended for speed)
cargo build --release

# 3. The binary will be located at:
# ./target/release/filter_pe
```

## 🚀 Usage

### Command Line Arguments

```bash
./target/release/filter_pe --help
```

| Argument | Flag | Description |
| :--- | :--- | :--- |
| **Input** | `-i, --input` | Input BAM file. **MUST be Name-Sorted** (`samtools sort -n`). |
| **Output** | `-o, --output` | Output Clean BAM file (will be Name-Sorted). |
| **Discarded** | `-d, --discarded` | (Optional) Output BAM file for discarded reads. |
| **Threads** | `-t, --threads` | Number of threads for compression/decompression (Default: 4). |

### ⚠️ CRITICAL: The Sorting Rule

This tool uses a streaming algorithm that requires R1 and R2 to be adjacent. Therefore:

1.  **Input**: You **MUST** sort your input by name (`samtools sort -n`) before running this tool.
2.  **Output**: The output will be name-sorted. You **MUST** sort it back to coordinate order (`samtools sort`) for downstream tools like MACS2 or IGV.

### Example Workflow

```bash
# Step 1: Name Sort (Prepare for filtering)
samtools sort -n -@ 8 input.bam -o input.namesorted.bam

# Step 2: Run Filter (The Rust Tool)
./target/release/filter_pe \
    -i input.namesorted.bam \
    -o clean.namesorted.bam \
    -d discarded.namesorted.bam \
    -t 8

# Step 3: Coordinate Sort (Finalize for analysis)
samtools sort -@ 8 clean.namesorted.bam -o final.clean.bam
samtools index final.clean.bam
```

---

## 🧬 Filtering Logic Explanation

The tool iterates through the BAM file pair by pair and applies the following logic:

1.  **Chimeric Check**: If `Read1_Chromosome != Read2_Chromosome` -> **Discard Both**.
2.  **Orientation Check**: Standard Illumina Paired-End library is FR (Forward-Reverse). If `Read1_Strand == Read2_Strand` (e.g., both Forward or both Reverse) -> **Discard Both**.
3.  **Singleton Check**: If a read is mapped but its mate is missing (or filtered out previously) -> **Discard**.

---

## 📦 Integration with Snakemake

```python
rule RustFilterPE:
    input:
        bam = "mapping/{sample}.sort.bam"
    output:
        bam = "filtered/{sample}.final.bam",
        json = "filtered/{sample}.filter_stats.json"
    threads: 8
    shell:
        """
        # 1. Name Sort
        samtools sort -n -@ {threads} -o {input.bam}.tmp {input.bam}
        
        # 2. Run Rust Tool
        /path/to/filter_pe \
            -i {input.bam}.tmp \
            -o {output.bam}.tmp \
            -t {threads}
            
        # 3. Coordinate Sort & Index
        samtools sort -@ {threads} -o {output.bam} {output.bam}.tmp
        samtools index {output.bam}
        
        # Cleanup
        rm {input.bam}.tmp {output.bam}.tmp
        """
```

---

# ATAC-seq Paired-End Filter (Rust 版)

这是一个高性能、多线程的工具，专为严格过滤 Paired-End (双端测序) ATAC-seq 或 ChIP-seq 数据而设计。

本工具使用 Rust 实现了复杂的过滤逻辑（这些逻辑很难通过简单的 `samtools` 命令实现）。它确保如果一对 Read 中的 **任何一条** 未通过质量检查（例如：错误的方向、嵌合比对），则 **两条 Read 都会被丢弃**，以保持严格的双端配对完整性。

## ✨ 主要特性

- **🚀 极速**: 使用 `rust-htslib` 编写，比 Pysam/Python 脚本快 5-10 倍。
- **🧵 多线程 I/O**: 利用并行 BGZF 压缩/解压，最大化吞吐量。
- **🧹 严格过滤**:
    - **去除嵌合 Read (Chimeric)**: 比对到不同染色体的 Read 对。
    - **去除错误方向 (Improper Orientation)**: 也就是去除不是 FR (Forward-Reverse) 也就是 "内向" 的 Read 对。
    - **去除孤儿 Read (Orphans)**: 如果一条 Read 被丢弃或缺失，其配对的 Mate 也会被移除。
- **📊 详细统计**: 生成 JSON 报告 (`.filter_stats.json`) 供下游 QC 使用（如 MultiQC）。
- **🗑️ 可追溯**: 可选将丢弃的 Read 保存到单独的 BAM 文件中以便调试。
- **👀 用户友好**: 带有实时进度条和彩色终端输出。

## 🛠️ 安装

### 前置条件

- **Rust**: 请通过 [rustup](https://rustup.rs/) 安装（建议最新稳定版）。
- **C 编译器** (gcc/clang): 编译 `htslib` 必须。

### 源码编译

```bash
# 1. 进入项目目录
cd src/ATACTools/filter_pe  # 或者你克隆的任何目录

# 2. 编译二进制文件 (强烈建议使用 Release 模式以获得最佳性能)
cargo build --release

# 3. 编译后的程序位于:
# ./target/release/filter_pe
```

## 🚀 使用方法

### 命令行参数

```bash
./target/release/filter_pe --help
```

| 参数 | 标记 | 说明 |
| :--- | :--- | :--- |
| **输入** | `-i, --input` | 输入 BAM 文件。**必须是 Name-Sorted (按名称排序)**。 |
| **输出** | `-o, --output` | 输出的清洗后 BAM 文件 (仍为 Name-Sorted)。 |
| **丢弃** | `-d, --discarded` | (可选) 保存被过滤掉的 Read 到此 BAM 文件。 |
| **线程** | `-t, --threads` | 用于压缩/解压的线程数 (默认: 4)。 |

### ⚠️ 关键提示：排序规则

本工具使用流式算法，要求 R1 和 R2 在文件中相邻。因此：

1.  **输入前**: 你 **必须** 先按名称排序输入文件 (`samtools sort -n`)。
2.  **输出后**: 输出文件也是按名称排序的。在进行后续分析（如 MACS2 或 IGV）之前，你 **必须** 将其重新按坐标排序 (`samtools sort`)。

### 工作流示例

```bash
# 第一步: 按名称排序 (为过滤做准备)
samtools sort -n -@ 8 input.bam -o input.namesorted.bam

# 第二步: 运行过滤工具 (Rust)
./target/release/filter_pe \
    -i input.namesorted.bam \
    -o clean.namesorted.bam \
    -d discarded.namesorted.bam \
    -t 8

# 第三步: 按坐标排序 (最终化，供后续分析)
samtools sort -@ 8 clean.namesorted.bam -o final.clean.bam
samtools index final.clean.bam
```

## 📝 License

This project is licensed under the MIT License.

# KEGG 数据库离线获取与物种扩展方案

> **文档类型**: 技术实现文档  
> **目标**: 建立可复用的 KEGG 数据离线获取管线，支持多物种扩展  
> **适用场景**: OmicHub 平台 KEGG 注释模块、离线富集分析  
> **最后更新**: 2026-07-08  
> **维护者**: CC (待补充细节)

---

## 1. 总体架构

### 1.1 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KEGG REST API                               │
│              https://rest.kegg.jp/<operation>/<argument>            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP GET
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    下载脚本层 (download_kegg.sh)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ gene.list   │  │pathway.list │  │   ko.list   │  │  brite.txt  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
│                           │                                         │
│                    ┌─────────────┐                                  │
│                    │ pathway_name│                                  │
│                    │   .list     │                                  │
│                    └─────────────┘                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    数据转换层 (make_gmt.py)                          │
│  ┌─────────────┐  ┌─────────────┐                                  │
│  │  *_kegg.gmt │  │  README.md  │                                  │
│  │  (GMT格式)  │  │ (数据说明)  │                                  │
│  └─────────────┘  └─────────────┘                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    平台存储层 (OmicHub)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  文件系统   │  │  数据库表   │  │  API 缓存   │                │
│  │  /data/...  │  │  kegg_ortho │  │  Redis/Mem  │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **离线优先** | 平台运行时不依赖 KEGG 在线服务，避免网络波动导致分析失败 |
| **多物种** | 通过物种代码参数化，同一脚本支持任意 KEGG 收录物种 |
| **增量更新** | 支持按时间戳检测更新，仅下载变更部分（TODO: CC 补充） |
| **标准化输出** | 统一生成 GMT 格式，兼容 gseapy、clusterProfiler、GSEA 等工具 |
| **元数据完整** | 每个物种目录自带 README，记录下载时间、版本、引用信息 |

---

## 2. KEGG REST API 详解

### 2.1 API 基础地址

```
https://rest.kegg.jp
```

KEGG 提供 REST 风格的 API，无需认证即可访问，但需遵守使用规范：
- 请求频率限制：建议间隔 1-2 秒，避免被封
- 数据用途：学术/研究用途免费，商业用途需订阅 KEGG FTP
- 引用要求：使用 KEGG 数据发表论文时必须引用 Kanehisa et al.

### 2.2 核心操作接口

KEGG REST API 使用 `/<operation>/<argument>` 格式，以下是本项目用到的操作：

#### 2.2.1 `list` — 列出数据库条目

**用途**: 获取指定数据库的全部条目列表

```
GET https://rest.kegg.jp/list/<database>
```

**参数**:
| 参数 | 说明 | 示例 |
|------|------|------|
| `<database>` | 数据库名称 | `ath` (物种基因), `pathway` (通路), `ko` (直系同源) |

**本项目调用**:
```bash
# 获取物种全部基因列表
GET https://rest.kegg.jp/list/ath

# 获取物种全部通路列表
GET https://rest.kegg.jp/list/pathway/ath
```

**返回格式** (TSV):
```
ath:AT1G01010	NAC001; NAC domain-containing protein 1
ath:AT1G01020	ARV1; ARV1-like protein
```

**解析规则**:
- 第一列为 KEGG 基因 ID，格式为 `<species_code>:<gene_id>`，如 `ath:AT1G01010`
- 第二列为基因名称和描述，以 `;` 分隔
- 需将 `ath:` 前缀去除，转换为平台标准 ID (如 `AT1G01010`)

---

#### 2.2.2 `link` — 数据库交叉链接

**用途**: 获取两个数据库之间的交叉引用关系

```
GET https://rest.kegg.jp/link/<target_db>/<source_db>
```

**参数**:
| 参数 | 说明 | 示例 |
|------|------|------|
| `<target_db>` | 目标数据库 | `pathway`, `ko`, `module`, `disease` |
| `<source_db>` | 源数据库 | `ath` (物种代码) |

**本项目调用**:
```bash
# 基因 → 通路 映射 (核心！用于富集分析背景集)
GET https://rest.kegg.jp/link/pathway/ath

# 基因 → KO 映射 (用于跨物种比较)
GET https://rest.kegg.jp/link/ko/ath
```

**返回格式** (TSV):
```
ath:AT1G01010	ath00940
ath:AT1G01020	ath00510
```

**解析规则**:
- 第一列为基因 ID (含物种前缀)
- 第二列为通路 ID (如 `ath00940`) 或 KO ID (如 `K12345`)
- 一个基因可能映射到多个通路（多行记录）
- 一个通路包含多个基因（多对多关系）

**通路 ID 编码规则**:
- 格式: `<species_code><5位数字>`
- 拟南芥: `ath00010` ~ `ath99999`
- 人类: `hsa00010` ~ `hsa99999`
- 通路编号与物种无关，前缀区分物种（如 `ath00940` 和 `hsa00940` 是同一通路在不同物种中的映射）

---

#### 2.2.3 `get` — 获取数据库条目详情

**用途**: 获取指定条目的详细信息

```
GET https://rest.kegg.jp/get/<dbentry>
```

**本项目调用**:
```bash
# 获取物种 BRITE 功能分类层次
GET https://rest.kegg.jp/get/br:ath00001
```

**BRITE 数据库说明**:
- BRITE 是 KEGG 的功能层次数据库，包含基因、通路、化合物等的分类体系
- `br:ath00001` 是拟南芥的基因功能层次文件
- 其他物种替换代码即可，如 `br:hsa00001` (人类)

**返回格式**: 层级文本，包含基因在 KEGG BRITE 中的分类路径

---

### 2.3 本项目 API 调用汇总

| 文件 | API 路径 | 用途 | 数据量 |
|------|----------|------|--------|
| `ath_gene.list` | `/list/ath` | 基因列表与描述 | ~2.4 MB |
| `ath_pathway.list` | `/link/pathway/ath` | 基因-通路映射 | ~396 KB |
| `ath_ko.list` | `/link/ko/ath` | 基因-KO映射 | ~273 KB |
| `ath_pathway_name.list` | `/list/pathway/ath` | 通路ID与名称 | ~12 KB |
| `ath_brite.txt` | `/get/br:ath00001` | BRITE功能分类 | ~2.3 MB |

---

## 3. 下载脚本实现

### 3.1 脚本架构

```bash
download_kegg.sh
├── 参数解析 (物种代码 + 输出目录)
├── 目录创建
├── 循环下载 (5 个文件)
│   ├── wget 下载 (超时60s, 重试3次)
│   ├── 进度显示
│   └── 礼貌间隔 (1s)
├── 结果汇总
├── 生成 README_<species>.md
└── 生成 make_gmt.py
```

### 3.2 核心代码片段

#### 3.2.1 物种代码验证

```bash
# 脚本不内置验证，由用户传入
# 建议 CC 补充：调用 KEGG API 验证物种代码是否有效
# 验证接口: https://rest.kegg.jp/list/organism
# 或本地维护物种代码白名单
```

**TODO (CC)**: 添加物种代码验证逻辑
- 方案A: 下载前调用 `https://rest.kegg.jp/list/organism` 获取全部有效物种代码，缓存到本地
- 方案B: 维护一个 `species_code.json` 白名单文件，包含常用物种
- 方案C: 捕获 wget 404 错误，提示用户查询 https://www.genome.jp/kegg/catalog/org_list.html

#### 3.2.2 下载循环实现

```bash
# 定义文件列表 (文件名|API路径)
declare -a FILES=(
    "${SPECIES}_gene.list|list/${SPECIES}"
    "${SPECIES}_pathway.list|link/pathway/${SPECIES}"
    "${SPECIES}_ko.list|link/ko/${SPECIES}"
    "${SPECIES}_pathway_name.list|list/pathway/${SPECIES}"
    "${SPECIES}_brite.txt|get/br:${SPECIES}00001"
)

# 下载函数
download_file() {
    local filename="$1"
    local api_path="$2"
    local filepath="${OUTPUT_DIR}/${filename}"
    local url="${KEGG_BASE}/${api_path}"

    wget -q --show-progress --timeout=60 --tries=3 -O "$filepath" "$url"
}
```

**关键参数说明**:
| 参数 | 值 | 说明 |
|------|-----|------|
| `-q` | — | 安静模式，减少输出 |
| `--show-progress` | — | 显示进度条 |
| `--timeout=60` | 60秒 | 连接超时 |
| `--tries=3` | 3次 | 失败重试 |
| `-O` | 输出路径 | 指定保存文件名 |

#### 3.2.3 礼貌间隔

```bash
sleep 1  # 每次请求间隔 1 秒
```

**TODO (CC)**: 考虑增加指数退避策略，当遇到 429 (Too Many Requests) 时自动增加间隔

---

### 3.3 多物种扩展

脚本通过 `SPECIES` 变量实现多物种支持，只需替换物种代码即可：

| 物种 | 代码 | 说明 |
|------|------|------|
| 拟南芥 | `ath` | 模式植物 |
| 人类 | `hsa` | Homo sapiens |
| 小鼠 | `mmu` | Mus musculus |
| 大鼠 | `rno` | Rattus norvegicus |
| 食蟹猴 | `mcc` | Macaca fascicularis |
| 水稻 | `osa` | Oryza sativa |
| 番茄 | `sly` | Solanum lycopersicum |
| 生菜 | `lsa` | Lactuca sativa |
| 大豆 | `gma` | Glycine max |
| 玉米 | `zma` | Zea mays |

**扩展方法**:
```bash
# 新物种只需替换代码
bash download_kegg.sh <species_code>
```

**TODO (CC)**: 考虑批量下载模式
```bash
# 批量下载多个物种
bash download_kegg.sh --batch ath,hsa,mmu,osa,sly
```

---

## 4. 数据转换层

### 4.1 GMT 格式生成

GMT (Gene Matrix Transposed) 是基因集富集分析的标准格式，每行代表一个基因集：

```
<gene_set_name>\t<description>\t<gene1>\t<gene2>\t...\t<geneN>
```

**转换逻辑**:

```python
import pandas as pd

# 1. 读取通路映射
pathway = pd.read_csv('ath_pathway.list', sep='\t', header=None, 
                       names=['gene_id', 'pathway_id'])

# 2. 读取通路名称
names = pd.read_csv('ath_pathway_name.list', sep='\t', header=None,
                     names=['pathway_id', 'pathway_name'])

# 3. 清洗基因 ID
# KEGG 格式: ath:AT1G01010 → 平台格式: AT1G01010
pathway['gene_id'] = pathway['gene_id'].str.replace('ath:', '')

# 4. 清洗通路名称
# 去除物种后缀: "Phenylpropanoid biosynthesis - Arabidopsis thaliana (thale cress)"
# → "Phenylpropanoid biosynthesis"
merged['pathway_name'] = merged['pathway_name'].str.replace(
    r' - .*', '', regex=True
)

# 5. 按通路分组，生成 GMT
with open('ath_kegg.gmt', 'w') as f:
    for pid, group in merged.groupby('pathway_id'):
        pname = group['pathway_name'].iloc[0]
        genes = '\t'.join(group['gene_id'].unique())
        f.write(f"{pid}\t{pname}\t{genes}\n")
```

**TODO (CC)**: 
- 增加基因 ID 标准化映射（处理不同数据库 ID 差异）
- 增加通路过滤（去除基因数过少/过多的通路）
- 增加通路层级信息（从 brite.txt 提取）

---

### 4.2 数据质量检查

**TODO (CC)**: 补充数据校验脚本

```bash
# 建议的校验项:
# 1. 文件非空检查
# 2. 行数统计（与预期对比）
# 3. 基因 ID 格式验证（正则匹配 AT\dG\d{5}）
# 4. 通路 ID 格式验证（正则匹配 ath\d{5}）
# 5. 通路-基因映射完整性检查（无孤儿通路/基因）
# 6. 与在线 API 对比抽样验证
```

---

## 5. 平台集成方案

### 5.1 文件存储结构

```
/data/omichub_data/kegg/
├── ath/                          # 拟南芥
│   ├── ath_gene.list
│   ├── ath_pathway.list
│   ├── ath_ko.list
│   ├── ath_pathway_name.list
│   ├── ath_brite.txt
│   ├── ath_kegg.gmt              # 转换后
│   └── README_ath.md
├── hsa/                          # 人类
│   ├── ...
│   └── hsa_kegg.gmt
├── mmu/                          # 小鼠
│   └── ...
├── species_index.json            # 物种索引（CC 补充）
└── last_update.json              # 更新时间戳（CC 补充）
```

### 5.2 数据库表设计（建议）

**TODO (CC)**: 补充数据库 schema

```sql
-- KEGG 通路表
CREATE TABLE kegg_pathways (
    pathway_id VARCHAR(20) PRIMARY KEY,      -- e.g., ath00940
    species_code VARCHAR(10) NOT NULL,         -- e.g., ath
    pathway_name VARCHAR(255),                 -- e.g., Phenylpropanoid biosynthesis
    category VARCHAR(100),                     -- 大类（从 brite 提取）
    gene_count INT,                            -- 包含基因数
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- KEGG 基因-通路映射表
CREATE TABLE kegg_gene_pathway (
    id SERIAL PRIMARY KEY,
    gene_id VARCHAR(50) NOT NULL,              -- e.g., AT1G01010
    species_code VARCHAR(10) NOT NULL,
    pathway_id VARCHAR(20) NOT NULL,
    ko_id VARCHAR(20),                         -- e.g., K12345
    FOREIGN KEY (pathway_id) REFERENCES kegg_pathways(pathway_id)
);

-- KEGG 基因信息表
CREATE TABLE kegg_genes (
    gene_id VARCHAR(50) PRIMARY KEY,
    species_code VARCHAR(10) NOT NULL,
    kegg_gene_id VARCHAR(50),                  -- e.g., ath:AT1G01010
    gene_name VARCHAR(255),
    description TEXT,
    ko_id VARCHAR(20)
);
```

---

## 6. 离线使用方案

### 6.1 与 gseapy 集成

```python
import gseapy as gp

# 使用离线 GMT 文件
enr = gp.enrich(
    gene_list=['AT1G01010', 'AT1G01020', 'AT1G01030'],  # 差异基因
    gene_sets='/data/omichub_data/kegg/ath/ath_kegg.gmt',
    organism='ath',  # 可选，仅用于背景基因集
    outdir='./enrichment_results',
    format='pdf'
)
```

### 6.2 与 clusterProfiler 集成（R）

```r
library(clusterProfiler)

# 读取 GMT
gmt <- read.gmt("/data/omichub_data/kegg/ath/ath_kegg.gmt")

# 富集分析
ego <- enricher(
    gene = c("AT1G01010", "AT1G01020", "AT1G01030"),
    TERM2GENE = gmt,
    pvalueCutoff = 0.05,
    qvalueCutoff = 0.2
)
```

### 6.3 与 OmicHub 平台 API 集成

**TODO (CC)**: 补充平台 API 设计

```python
# 伪代码：平台内部调用
from omichub.kegg import KEGGDatabase

kegg = KEGGDatabase(species='ath')

# 获取基因所属通路
pathways = kegg.get_pathways_for_gene('AT1G01010')
# → ['ath00940', 'ath00945', ...]

# 获取通路详情
info = kegg.get_pathway_info('ath00940')
# → {'name': 'Phenylpropanoid biosynthesis', 'genes': [...], 'ko': [...]}

# 运行富集分析
result = kegg.enrich(gene_list=['AT1G01010', ...], method='ORA')
```

---

## 7. 更新策略

### 7.1 手动更新

```bash
# 重新下载指定物种
bash download_kegg.sh ath /data/omichub_data/kegg/ath

# 重新生成 GMT
cd /data/omichub_data/kegg/ath && python3 make_gmt.py ath
```

### 7.2 自动更新（TODO: CC 补充）

**建议方案**:
- 设置定时任务（cron），每月 1 日检查更新
- 通过 HTTP HEAD 请求获取 `Last-Modified` 时间戳
- 与本地记录对比，仅下载变更文件
- 更新后触发 GMT 重新生成和数据库同步

```bash
# 检查更新脚本框架
# TODO: CC 实现
wget --spider --server-response https://rest.kegg.jp/list/ath 2>&1 | grep "Last-Modified"
```

---

## 8. 常见问题与排查

### 8.1 下载失败

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 404 Not Found | 物种代码错误 | 查询 https://www.genome.jp/kegg/catalog/org_list.html |
| 连接超时 | 网络问题 | 增加 `--timeout` 和 `--tries` |
| 429 Too Many Requests | 请求过快 | 增加 `sleep` 间隔，或使用代理 |
| 空文件 | KEGG 无该物种数据 | 检查物种是否被 KEGG 收录 |

### 8.2 数据不一致

| 现象 | 原因 | 解决方案 |
|------|------|----------|
| 通路名称缺失 | pathway_name.list 未下载 | 确保 5 个文件全部下载成功 |
| 基因 ID 不匹配 | 物种前缀未去除 | 检查 GMT 生成脚本中的 `str.replace` |
| 通路基因数异常 | 过滤条件不当 | 检查是否过滤了过多基因 |

---

## 9. 引用与许可

### 9.1 数据引用

使用 KEGG 数据发表论文时必须引用：

```
Kanehisa M, Furumichi M, Sato Y, Kawashima M, Ishiguro-Watanabe M.
KEGG: Biological Systems Database.
Nucleic Acids Research, 51(D1):D678-D685, 2023.
doi: 10.1093/nar/gkac956
```

### 9.2 使用许可

- **学术/研究用途**: 免费使用 KEGG REST API
- **商业用途**: 需购买 KEGG FTP 订阅 (https://www.kegg.jp/kegg/legal.html)
- **平台集成**: 建议定期更新数据，并在平台内展示 KEGG 引用信息

---

## 10. 附录

### 10.1 完整脚本清单

| 脚本 | 路径 | 说明 |
|------|------|------|
| `download_kegg.sh` | `/app/scripts/` | 主下载脚本 |
| `make_gmt.py` | 各物种目录内 | GMT 生成脚本（由 download_kegg.sh 自动生成）|
| `validate_kegg.py` | `/app/scripts/` (TODO) | 数据校验脚本 |
| `update_kegg.py` | `/app/scripts/` (TODO) | 自动更新脚本 |

### 10.2 常用物种代码速查

```json
{
  "ath": "Arabidopsis thaliana (拟南芥)",
  "hsa": "Homo sapiens (人类)",
  "mmu": "Mus musculus (小鼠)",
  "rno": "Rattus norvegicus (大鼠)",
  "mcc": "Macaca fascicularis (食蟹猴)",
  "osa": "Oryza sativa (水稻)",
  "sly": "Solanum lycopersicum (番茄)",
  "lsa": "Lactuca sativa (生菜)",
  "gma": "Glycine max (大豆)",
  "zma": "Zea mays (玉米)",
  "ptr": "Pan troglodytes (黑猩猩)",
  "bta": "Bos taurus (牛)",
  "gga": "Gallus gallus (鸡)",
  "dre": "Danio rerio (斑马鱼)",
  "cel": "Caenorhabditis elegans (线虫)",
  "dme": "Drosophila melanogaster (果蝇)",
  "sce": "Saccharomyces cerevisiae (酿酒酵母)",
  "eco": "Escherichia coli (大肠杆菌)"
}
```

### 10.3 KEGG API 完整文档

- 官方文档: https://www.kegg.jp/kegg/rest/keggapi.html
- 操作列表: https://www.kegg.jp/kegg/rest/keggapi.html#list
- 链接操作: https://www.kegg.jp/kegg/rest/keggapi.html#link
- 获取操作: https://www.kegg.jp/kegg/rest/keggapi.html#get

---

> **TODO 清单 (CC 补充)**:
> 1. [ ] 实现物种代码验证模块
> 2. [ ] 实现批量下载模式 `--batch`
> 3. [ ] 实现数据校验脚本 `validate_kegg.py`
> 4. [ ] 实现自动更新机制（时间戳检查 + cron）
> 5. [ ] 设计数据库 schema 并创建表
> 6. [ ] 实现平台内部 KEGG API 封装
> 7. [ ] 增加通路层级信息提取（从 brite.txt）
> 8. [ ] 增加基因 ID 标准化映射表
> 9. [ ] 增加下载失败告警机制（邮件/钉钉）
> 10. [ ] 编写单元测试覆盖下载和转换流程

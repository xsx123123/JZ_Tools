# KEGG 离线注释数据库下载指南

> 基于 KEGG REST API 构建本地物种注释数据库，用于 OmicHub 平台后续富集分析（GSEApy）的离线支撑。

---

## 一、核心原理

KEGG REST API 采用统一的 URL 格式：

```
https://rest.kegg.jp/<operation>/<argument>
```

其中 `<operation>` 为操作类型（`list`, `link`, `get` 等），`<argument>` 为查询参数。对于物种注释下载，只需将 `<org>` 替换为目标物种的 **KEGG 3~4 字母代码** 即可。

> 参考文档：https://www.kegg.jp/kegg/rest/keggapi.html

---

## 二、常用物种 KEGG 代码对照表

| 物种 | 学名 | KEGG Code | 注释完整度 |
|------|------|-----------|-----------|
| 拟南芥 | *Arabidopsis thaliana* | `ath` | ⭐⭐⭐⭐⭐ 非常完整 |
| 水稻（日本晴） | *Oryza sativa* (japonica) | `osa` | ⭐⭐⭐⭐⭐ 非常完整 |
| 水稻（籼稻） | *Oryza sativa* (indica) | `dosa` | ⭐⭐⭐⭐ 较完整 |
| 番茄 | *Solanum lycopersicum* | `sly` | ⭐⭐⭐ 中等 |
| 生菜 | *Lactuca sativa* | `lsa` | ⭐⭐⭐ 中等 |
| Human | *Homo sapiens* | `hsa` | ⭐⭐⭐⭐⭐ 非常完整 |
| Mouse（小鼠） | *Mus musculus* | `mmu` | ⭐⭐⭐⭐⭐ 非常完整 |
| Rat（大鼠） | *Rattus norvegicus* | `rno` | ⭐⭐⭐⭐⭐ 非常完整 |
| 食蟹猴 | *Macaca fascicularis* | `mcc` | ⭐⭐⭐⭐ 较完整 |

> **注意**：番茄 (`sly`) 和生菜 (`lsa`) 作为非模式作物，KEGG 注释覆盖度可能不如拟南芥/水稻。建议下载后先检查文件大小和内容是否为空。

---

## 三、五条核心下载命令（以 `<org>` 为模板）

以下命令将 `<org>` 替换为具体物种代码即可使用。以拟南芥 (`ath`) 为例：

### 1. 物种所有基因列表
获取该物种在 KEGG 中收录的全部基因条目。

```bash
wget https://rest.kegg.jp/list/<org> -O <org>_gene.list
```

**示例（拟南芥）：**
```bash
wget https://rest.kegg.jp/list/ath -O ath_gene.list
```

**文件格式：**
```
ath:AT1G01010		NAC domain containing protein 1 [KO:K12345]
ath:AT1G01020		Protein of unknown function [KO:K67890]
...
```

---

### 2. 基因 ↔ 通路 映射（最关键）
建立基因与 KEGG Pathway 之间的映射关系，这是富集分析的核心输入。

```bash
wget https://rest.kegg.jp/link/pathway/<org> -O <org>_pathway.list
```

**示例（拟南芥）：**
```bash
wget https://rest.kegg.jp/link/pathway/ath -O ath_pathway.list
```

**文件格式：**
```
ath:AT1G01010		path:ath00010
ath:AT1G01020		path:ath00190
...
```

---

### 3. 基因 ↔ KO (KEGG Orthology) 映射
建立基因与 KO 编号之间的映射，KO 是跨物种功能注释的核心桥梁。

```bash
wget https://rest.kegg.jp/link/ko/<org> -O <org>_ko.list
```

**示例（拟南芥）：**
```bash
wget https://rest.kegg.jp/link/ko/ath -O ath_ko.list
```

**文件格式：**
```
ath:AT1G01010		ko:K12345
ath:AT1G01020		ko:K67890
...
```

---

### 4. 通路列表
获取该物种所有通路（Pathway）的 ID 与名称对照。

```bash
wget https://rest.kegg.jp/list/pathway/<org> -O <org>_pathway_name.list
```

**示例（拟南芥）：**
```bash
wget https://rest.kegg.jp/list/pathway/ath -O ath_pathway_name.list
```

**文件格式：**
```
path:ath00010		Glycolysis / Gluconeogenesis [PATH:ath00010]
path:ath00020		Citrate cycle (TCA cycle) [PATH:ath00020]
...
```

---

### 5. 通路分类（BRITE）
KEGG BRITE 是对通路/基因进行层级分类的数据库，用于了解通路所属的功能大类。

```bash
wget https://rest.kegg.jp/get/br:<org>00001 -O <org>_brite.txt
```

**示例（拟南芥）：**
```bash
wget https://rest.kegg.jp/get/br:ath00001 -O ath_brite.txt
```

> **格式说明**：`br:<org>00001` 中的 `00001` 为固定后缀，前面接物种代码。如番茄为 `br:sly00001`，生菜为 `br:lsa00001`。

**文件格式（层级结构）：**
```
A09100 Metabolism
  A09101 Carbohydrate metabolism
    ath00010  Glycolysis / Gluconeogenesis
    ath00020  Citrate cycle (TCA cycle)
...
```

---

## 四、一键批量下载脚本

### Bash 版本

```bash
#!/bin/bash
# download_kegg_annotations.sh
# 用法: ./download_kegg_annotations.sh <org_code>
# 示例: ./download_kegg_annotations.sh ath

ORG=$1
OUTDIR="kegg_annotations/${ORG}"
mkdir -p ${OUTDIR}

echo "[INFO] 开始下载 ${ORG} 的 KEGG 注释数据..."

# 限速：KEGG 官方限制每秒最多 3 次请求
wget https://rest.kegg.jp/list/${ORG} -O ${OUTDIR}/${ORG}_gene.list
sleep 0.4
wget https://rest.kegg.jp/link/pathway/${ORG} -O ${OUTDIR}/${ORG}_pathway.list
sleep 0.4
wget https://rest.kegg.jp/link/ko/${ORG} -O ${OUTDIR}/${ORG}_ko.list
sleep 0.4
wget https://rest.kegg.jp/list/pathway/${ORG} -O ${OUTDIR}/${ORG}_pathway_name.list
sleep 0.4
wget https://rest.kegg.jp/get/br:${ORG}00001 -O ${OUTDIR}/${ORG}_brite.txt
sleep 0.4

echo "[INFO] ${ORG} 下载完成，输出目录: ${OUTDIR}"
```

### Python 版本（推荐，便于集成到 OmicHub）

```python
import requests
import time
import os
from pathlib import Path

KEGG_BASE = "https://rest.kegg.jp"
RATE_LIMIT = 0.4  # 秒，限速防封

DOWNLOAD_MAP = {
    "gene_list":      "/list/{org}",
    "pathway_link":   "/link/pathway/{org}",
    "ko_link":        "/link/ko/{org}",
    "pathway_list":   "/list/pathway/{org}",
    "brite":          "/get/br:{org}00001",
}

def download_kegg_annotations(org: str, outdir: str = "kegg_annotations"):
    '''下载指定物种的 KEGG 注释数据'''
    out_path = Path(outdir) / org
    out_path.mkdir(parents=True, exist_ok=True)

    for name, endpoint in DOWNLOAD_MAP.items():
        url = KEGG_BASE + endpoint.format(org=org)
        outfile = out_path / f"{org}_{name}.txt"

        print(f"[下载] {url} -> {outfile}")
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            outfile.write_text(resp.text, encoding="utf-8")
            print(f"  完成 ({len(resp.text)} 字符)")
        except Exception as e:
            print(f"  失败: {e}")

        time.sleep(RATE_LIMIT)

    print(f"[完成] {org} 所有文件已保存至 {out_path}")

# 使用示例
if __name__ == "__main__":
    species_list = ["ath", "sly", "lsa", "osa", "hsa", "mmu", "rno", "mcc"]
    for sp in species_list:
        download_kegg_annotations(sp)
```

---

## 五、查询全部可用物种

如果不确定某个物种在 KEGG 中是否存在、代码是什么，可以下载完整物种列表进行查询：

```bash
wget https://rest.kegg.jp/list/organism -O kegg_organism.list
```

然后使用 grep 搜索：

```bash
# 搜索生菜
grep -i "lactuca" kegg_organism.list

# 搜索番茄
grep -i "lycopersicum" kegg_organism.list

# 搜索食蟹猴
grep -i "fascicularis" kegg_organism.list
```

**文件格式：**
```
T01001		hsa		Homo sapiens (human)
T01005		mmu		Mus musculus (mouse)
T01006		rno		Rattus norvegicus (rat)
...
```

---

## 六、重要注意事项

### 1. 请求限速
KEGG 官方限制 **每秒最多 3 次请求**。批量下载时务必加入 `sleep 0.4` 或更长的间隔，否则 IP 可能被临时封禁。建议夜间或低峰时段进行大批量下载。

### 2. 注释完整度差异
- **模式生物**（拟南芥、水稻、人、小鼠）：KEGG 注释非常全面，通路覆盖率高。
- **作物/非模式物种**（番茄、生菜）：可能存在部分通路缺失、KO 映射不完整的情况。建议下载后检查文件大小，若 `_pathway.list` 为空或极小，说明该物种在 KEGG 中通路注释有限。

### 3. BRITE 层级结构
`br:<org>00001` 返回的是该物种的 **KEGG Pathway 层级分类**（BRITE 数据库），不是通路本身的详情。如需通路详情（如包含哪些基因、酶、化合物），需使用：
```bash
wget https://rest.kegg.jp/get/ath00010 -O ath00010_detail.txt
```

### 4. 数据更新频率
KEGG 数据库持续更新，建议定期（如每季度）重新下载一次，确保注释信息最新。

### 5. 与 GSEApy 的衔接
下载的 `_pathway.list` 和 `_gene.list` 可以直接用于构建 GSEApy 的 `gmt` 文件或自定义基因集，实现完全离线的 KEGG 富集分析，摆脱对 KEGG 在线服务的依赖。

---

## 七、文件目录结构建议

```
kegg_annotations/
├── ath/
│   ├── ath_gene.list
│   ├── ath_pathway.list
│   ├── ath_ko.list
│   ├── ath_pathway_name.list
│   └── ath_brite.txt
├── sly/
│   ├── sly_gene.list
│   ├── sly_pathway.list
│   ├── sly_ko.list
│   ├── sly_pathway_name.list
│   └── sly_brite.txt
├── lsa/
│   └── ...
├── hsa/
│   └── ...
└── kegg_organism.list  # 总物种列表
```

---

## 八、后续扩展（CC 补充方向）

- [ ] 添加 `gmt` 文件生成脚本，直接对接 GSEApy
- [ ] 添加数据库导入脚本（SQLite / PostgreSQL），便于 OmicHub 平台查询
- [ ] 添加通路详情批量下载（`get/pathway/<pathway_id>`）
- [ ] 添加 KO 详情批量下载（`get/ko:<ko_id>`）
- [ ] 添加定时更新任务（crontab / celery beat）
- [ ] 添加下载失败重试机制与日志记录
- [ ] 添加物种注释完整度统计报告

---

> 文档生成时间：2026-07-08
> 适用平台：OmicHub
> 技术栈：Python + KEGG REST API + GSEApy

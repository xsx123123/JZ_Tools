from ..accessions import STUDY_PATTERN
from .registry import ToolSpec, p

TOOLS = [
    ToolSpec("seqout_get_project_detail", "/project/{accession}", "获取 GEO/SRA 项目详情。", (p("accession"),), summary="项目 {accession} 详情"),
    ToolSpec("seqout_get_project_metadata", "/project/{accession}/metadata", "获取项目标题与描述。", (p("accession"),), summary="项目 {accession} 元数据"),
    ToolSpec("seqout_get_project_citation", "/project/{accession}/cite", "获取项目 BibTeX 引用。", (p("accession"),), summary="项目 {accession} 引用"),
    ToolSpec("seqout_get_project_enriched", "/project/{accession}/enriched", "获取带本体论注释的增强样本元数据。", (p("accession"),), summary="项目 {accession} 增强元数据"),
    ToolSpec("seqout_get_experiments", "/project/{study_accession}/experiments", f"列出研究实验。支持 GSE（自动解析）；研究编号格式：{STUDY_PATTERN}。结果最多展示 20 条。", (p("study_accession"),), resolver="study", transform="bounded", summary="研究 {study_accession} 的实验列表"),
    ToolSpec("seqout_get_runs", "/project/{study_accession}/runs", f"列出研究的测序运行。支持 GSE 自动解析；研究编号格式：{STUDY_PATTERN}。结果最多展示 20 条。", (p("study_accession"),), resolver="study", transform="bounded", summary="研究 {study_accession} 的运行列表"),
    ToolSpec("seqout_get_run_download", "/run/{run_accession}", "获取单个测序运行的下载链接。", (p("run_accession"),), summary="运行 {run_accession} 下载链接"),
    ToolSpec("seqout_get_download_links", "/project/{study_accession}/runs/download", f"获取研究运行下载链接 TSV。支持 GSE 自动解析；研究编号格式：{STUDY_PATTERN}。", (p("study_accession"),), resolver="study", summary="研究 {study_accession} 下载链接"),
    ToolSpec("seqout_get_metadata_csv", "/project/{study_accession}/metadata/download", f"获取研究合并元数据 CSV。支持 GSE 自动解析；研究编号格式：{STUDY_PATTERN}。", (p("study_accession"),), resolver="study", summary="研究 {study_accession} 元数据 CSV"),
]

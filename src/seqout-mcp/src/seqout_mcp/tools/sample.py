from ..accessions import SAMPLE_PATTERN
from .registry import ToolSpec, p

TOOLS = [
    ToolSpec("seqout_get_sample_metadata", "/sample/{accession}", f"获取样本元数据；GSM 编号自动使用 sample-detail 通道。支持格式：{SAMPLE_PATTERN}。", (p("accession"),), resolver="sample", summary="样本 {accession} 元数据"),
    ToolSpec("seqout_get_sample_detail", "/sample-detail/{accession}", f"获取完整样本详细信息。支持格式：{SAMPLE_PATTERN}。", (p("accession"),), resolver="sample_detail", summary="样本 {accession} 详细信息"),
    ToolSpec("seqout_get_sample_manifest", "/geo/series/{accession}/samples", "获取 GEO 项目的样本清单预览。", (p("accession"), p("max_samples", int, 20)), transform="samples", summary="项目 {accession} 样本清单"),
    ToolSpec("seqout_resolve_accession", "/accession/{accession}/project", "反查 GSM 或 Run 编号归属的项目。", (p("accession"),), summary="编号 {accession} 的项目解析结果"),
    ToolSpec("seqout_resolve_prj", "/prj/{prj_accession}", "将 BioProject 编号解析到研究级编号。", (p("prj_accession"),), summary="BioProject {prj_accession} 解析结果"),
]

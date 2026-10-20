from .registry import ToolSpec, p

TOOLS = [
    ToolSpec("seqout_search", "/search", "在 GEO/SRA/ENA/GSA 公共数据库中搜索组学项目。", (p("query"), p("limit", int, 5), p("cursor", str, None)), {"q": "query", "cursor": "cursor"}, transform="search", summary="找到匹配项目"),
    ToolSpec("seqout_search_geo", "/search/geo", "仅搜索 GEO 数据集。", (p("query"), p("limit", int, 5), p("cursor", str, None)), {"q": "query", "cursor": "cursor"}, transform="search", summary="GEO 搜索结果"),
    ToolSpec("seqout_search_sra", "/search/sra", "仅搜索 SRA 测序记录。", (p("query"), p("limit", int, 5), p("cursor", str, None)), {"q": "query", "cursor": "cursor"}, transform="search", summary="SRA 搜索结果"),
    ToolSpec("seqout_search_structured", "/search/structured", "按物种、实验类型或测序策略过滤搜索。library_strategy 常用值：RNA-Seq、WGS、ChIP-Seq、scRNA-Seq。传入上次响应的 next_cursor 可继续翻页。", (p("organism", str, None), p("library_strategy", str, None), p("assay_l1", str, None), p("assay_l2", str, None), p("limit", int, 5), p("cursor", str, None)), {"organism": "organism", "library_strategy": "library_strategy", "assay_l1": "assay_l1", "assay_l2": "assay_l2", "cursor": "cursor"}, transform="search", summary="结构化搜索结果"),
]

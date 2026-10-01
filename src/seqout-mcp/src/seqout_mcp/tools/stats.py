from typing import Literal

from .registry import ToolSpec, p

TOOLS = [
    ToolSpec("seqout_get_ontology_term", "/ontology/term", "查询本体论术语及相关信息。", (p("term"),), {"term": "term"}, summary="本体论术语信息"),
    ToolSpec("seqout_get_organisms", "/organisms", "列出支持的物种；结果最多展示 20 条并保留总数。", transform="bounded", summary="支持的物种列表"),
    ToolSpec("seqout_get_common_name", "/common-name", "查询物种常用名。", (p("scientific_name"),), {"scientific_name": "scientific_name"}, summary="物种 {scientific_name} 的常用名称"),
    ToolSpec("seqout_get_stats_growth", "/stats/growth", "获取数据库增长情况。mode 可选 projects、experiments、bases。", (p("mode", Literal["projects", "experiments", "bases"], "projects"),), {"mode": "mode"}, summary="数据库增长统计（{mode}）"),
    ToolSpec("seqout_get_organism_totals", "/stats/organism-totals", "获取每个物种的实验总数；结果最多展示 20 条并保留总数。", transform="bounded", summary="物种实验总数统计"),
    ToolSpec("seqout_get_platform_totals", "/stats/platform-totals", "获取平台实验总数；传 platform 时查询对应过滤选项。结果最多展示 20 条并保留总数。", (p("platform", str, None),), {"platform": "platform"}, resolver="platform", transform="bounded", summary="平台实验总数"),
    ToolSpec("seqout_beacon_info", "/beacon/info", "获取 Beacon 身份和元数据。", summary="Beacon 元数据"),
    ToolSpec("seqout_beacon_runs", "/beacon/runs", "Beacon 当前仅支持默认查询；服务端返回默认分页结果。不要传入 limit/skip 参数。TODO：服务端真正支持 POST 查询后再封装分页。", summary="Beacon 默认运行记录"),
]

from . import project, sample, search, stats
from .registry import ToolSpec, make_tool

ALL_SPECS: list[ToolSpec] = search.TOOLS + project.TOOLS + sample.TOOLS + stats.TOOLS


def register_all(server, client_getter):
    for spec in ALL_SPECS:
        server.tool(make_tool(spec, client_getter))

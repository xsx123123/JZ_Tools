"""services：纯 Python 业务层（M1 抽离）

铁律：无框架依赖（不 import FastMCP、不碰 stdio），吃 client 返回的 dict，可裸测。
MCP 与 REST（二期）共用本层，禁止在 tools/ 重复实现业务逻辑。
"""

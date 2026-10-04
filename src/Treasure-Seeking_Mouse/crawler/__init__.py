"""捉虫模块（T1）：queue + exec + sleeper 最小骨架。

- ``sleeper``：RUNNING/IDLE/SLEEP 状态机 + 指数退避 + Event 统一唤醒
- ``runner``：主循环（命令队列优先于任务队列）
- ``cli``：``python -m crawler.cli wake|status|submit`` 管理入口（外部唤醒源之一）
"""

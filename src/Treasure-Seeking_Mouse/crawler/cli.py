"""CLI 管理入口（唤醒源之一）：显式命令 → poke。

当前为进程内演示形态：同进程起 runner 后可用本模块的函数唤酷。
跨进程形态（写文件/redis 信箱）在爬虫本体落地时接入，接口保持 ``wake(reason)`` 不变。
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from .runner import Command, CrawlerQueue, Task, crawler_main
from .sleeper import CrawlerConfig, Sleeper


async def _demo() -> None:
    """端到端演示：入队 → 执行 → 空闲退避 → 命令唤醒。"""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    stopped = asyncio.Event()
    sleeper = Sleeper(config=CrawlerConfig(idle_backoff=(1, 1, 1), deep_sleep_after_cycles=2, heartbeat_interval=2))
    queue = CrawlerQueue(sleeper)

    async def handler(task: Task) -> None:
        print(f"[demo] 执行任务: {task.kind} {task.payload}")

    async def driver() -> None:
        # demo 编排节奏用的 sleep（非生产轮询路径；生产路径的等待统一走 Sleeper/Clock）
        queue.submit(Task("dig", {"query": "GSE liver"}))
        await asyncio.sleep(3)
        queue.command(Command("wake"))
        await asyncio.sleep(1.5)
        stopped.set()

    await asyncio.gather(crawler_main(sleeper, queue, handler, stopped), driver())


def main() -> None:
    parser = argparse.ArgumentParser(description="捉虫管理 CLI（唤醒源之一）")
    parser.add_argument("action", choices=["wake", "status", "submit", "demo"],
                        help="wake=显式唤醒；status=查状态；submit=提交任务；demo=端到端演示")
    parser.add_argument("--reason", default="cli", help="唤醒原因（记入日志）")
    parser.add_argument("--kind", default="dig", help="任务类型")
    parser.add_argument("--query", default="", help="任务参数 query")
    args = parser.parse_args()

    if args.action == "demo":
        asyncio.run(_demo())
        return
    # 单进程 CLI 形态：跨进程信箱接入前的占位说明
    print(f"[cli] {args.action} reason={args.reason} —— 需在 crawler_main 同进程内调用 Sleeper.poke / CrawlerQueue.submit")


if __name__ == "__main__":
    main()

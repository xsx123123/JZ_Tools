"""最小爬虫骨架（T1 决策 B）：queue + exec + sleeper 三件套。

现有捉虫逻辑接入点：把 ``register_handler`` 的任务处理替换为真实爬取逻辑即可，
主循环/休眠/唤醒机制不需要动。唤醒消费顺序：命令队列 → 任务队列（优先级差异在消费侧）。
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

from .sleeper import CrawlerConfig, Sleeper, State

logger = logging.getLogger("crawler")


@dataclass
class Task:
    """一次捉虫任务；payload 由具体 handler 解释。"""
    kind: str
    payload: dict = field(default_factory=dict)


@dataclass
class Command:
    """管理命令（优先级高于任务）：wake / pause 等。"""
    action: str
    payload: dict = field(default_factory=dict)


class CrawlerQueue:
    """命令队列 + 任务队列：命令优先消费；入队即 poke（wake_on_queue）。"""

    def __init__(self, sleeper: Sleeper) -> None:
        self.sleeper = sleeper
        self.commands: asyncio.Queue[Command] = asyncio.Queue()
        self.tasks: asyncio.Queue[Task] = asyncio.Queue()

    def submit(self, task: Task, *, source: str = "api") -> None:
        self.tasks.put_nowait(task)
        logger.info("crawler enqueue task kind=%s source=%s", task.kind, source)
        if self.sleeper.config.wake_on_queue:
            self.sleeper.poke(f"task:{task.kind}:{source}")

    def command(self, cmd: Command) -> None:
        self.commands.put_nowait(cmd)
        self.sleeper.poke(f"cmd:{cmd.action}")


async def crawler_main(
    sleeper: Sleeper | None = None,
    queue: CrawlerQueue | None = None,
    handler=None,
    stopped: asyncio.Event | None = None,
) -> None:
    """主循环：RUNNING 执行任务，队列空转 IDLE 退避，深空进 SLEEP。

    handler: ``async (Task) -> None``；默认仅记录（最小骨架）。
    stopped: 外部停止信号。
    """
    sleeper = sleeper or Sleeper(config=CrawlerConfig.from_env())
    queue = queue or CrawlerQueue(sleeper)
    stopped = stopped or asyncio.Event()
    handler = handler or _noop_handler

    logger.info("crawler start backoff=%s deep_after=%d heartbeat=%ds",
                sleeper.config.idle_backoff,
                sleeper.config.deep_sleep_after_cycles,
                sleeper.config.heartbeat_interval)

    while not stopped.is_set():
        # 唤醒后先看命令队列，再看任务队列（唤醒优先级在消费侧）
        cmd = _get_nowait(queue.commands)
        if cmd is not None:
            if cmd.action == "wake":
                sleeper.idle_cycles = 0
                sleeper._transition(State.RUNNING, reason="cmd:wake")
            else:
                logger.info("crawler cmd %s ignored (unknown)", cmd.action)
            continue

        task = _get_nowait(queue.tasks)
        if task is not None:
            sleeper.idle_cycles = 0
            sleeper._transition(State.RUNNING, reason="task")
            try:
                await handler(task)  # 现有捉虫逻辑原样保留的接入点
                sleeper.note_activity()
            except Exception:
                logger.exception("crawler task failed kind=%s", task.kind)
        else:
            sleeper._transition(State.IDLE)
            await sleeper.wait_idle()  # 内部可能转入 SLEEP 并被唤醒


def _get_nowait(q: asyncio.Queue):
    try:
        return q.get_nowait()
    except asyncio.QueueEmpty:
        return None


async def _noop_handler(task: Task) -> None:
    logger.info("crawler noop task kind=%s payload=%r", task.kind, task.payload)

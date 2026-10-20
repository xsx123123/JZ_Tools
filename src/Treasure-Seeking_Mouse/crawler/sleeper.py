"""捉虫休眠器（T1）：RUNNING/IDLE/SLEEP 三态 + 指数退避 + Event 统一唤醒收口。

设计要点（与总实现文档 §一 对齐）：
- 全项目只允许本模块两处 ``asyncio.wait_for(Event.wait(), timeout=...)``；禁止裸 sleep
- 状态日志格式固定：``crawler.state <FROM> -> <TO> reason=<r> idle_cycles=<n>``
- 唤醒优先级在消费侧处理：唤醒后先看命令队列、再看任务队列（见 ``crawler/runner.py``）
- 时钟可注入：``Clock.wait(event, delay)`` 抽象掉 ``asyncio.wait_for``，单测不用真等 90 分钟
- SLEEP 释放重资源（HTTP session 等，经 ``resource_hooks`` 注入），保留 DB 连接池靠心跳 ``SELECT 1`` 保活
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("crawler")

DEFAULT_IDLE_BACKOFF: tuple[int, ...] = (60, 300, 900, 1800)


class State(str, Enum):
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    SLEEP = "SLEEP"


@dataclass(frozen=True)
class CrawlerConfig:
    """加载后 frozen 收口；env 覆盖由 ``from_env`` 处理（CRAWLER_HEARTBEAT=0 等）。"""
    idle_backoff: tuple[int, ...] = DEFAULT_IDLE_BACKOFF
    deep_sleep_after_cycles: int = 3
    heartbeat_interval: int = 1800
    wake_on_queue: bool = True

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "CrawlerConfig":
        import os

        env = env if env is not None else dict(os.environ)
        backoff = DEFAULT_IDLE_BACKOFF
        if env.get("CRAWLER_IDLE_BACKOFF"):
            try:
                backoff = tuple(max(1, int(x)) for x in env["CRAWLER_IDLE_BACKOFF"].split(","))
            except ValueError:
                logger.warning("CRAWLER_IDLE_BACKOFF 非法，回退默认阶梯: %r", env["CRAWLER_IDLE_BACKOFF"])
        try:
            deep = max(1, int(env.get("CRAWLER_DEEP_SLEEP_AFTER", "3")))
        except ValueError:
            deep = 3
        try:
            heartbeat = max(0, int(env.get("CRAWLER_HEARTBEAT", "1800")))
        except ValueError:
            heartbeat = 1800
        return cls(
            idle_backoff=backoff or DEFAULT_IDLE_BACKOFF,
            deep_sleep_after_cycles=deep,
            heartbeat_interval=heartbeat,
            wake_on_queue=env.get("CRAWLER_WAKE_ON_QUEUE", "1") not in ("0", "false", "False"),
        )


@dataclass
class ResourceHooks:
    """SLEEP 释放/重建重资源的钩子；默认无操作（无 session 的最小骨架）。"""
    release: object = None   # callable[[], Awaitable[None]] | None
    acquire: object = None   # callable[[], Awaitable[None]] | None


class Clock:
    """可注入时钟：生产实现是 asyncio.wait_for；单测替换为立即返回/虚拟时间。"""

    async def wait(self, event: asyncio.Event, delay: float) -> bool:
        """等 event 或 delay 秒；返回 True=被唤醒，False=超时。"""
        try:
            await asyncio.wait_for(event.wait(), timeout=delay)
            return True
        except asyncio.TimeoutError:
            return False

    async def sleep(self, delay: float) -> None:
        await asyncio.sleep(delay)


@dataclass
class Sleeper:
    """状态机 + 退避 + 唤醒收口。主循环用法见 ``runner.crawler_main``。"""

    config: CrawlerConfig = field(default_factory=CrawlerConfig)
    wake: asyncio.Event = field(default_factory=asyncio.Event)
    clock: Clock = field(default_factory=Clock)
    resources: ResourceHooks = field(default_factory=ResourceHooks)
    idle_cycles: int = 0
    state: State = State.RUNNING

    # ---------- 主循环调用的两个入口 ----------

    async def wait_idle(self) -> None:
        """IDLE 期：等退避间隔或唤醒；连续深空后转入 SLEEP。"""
        idx = min(self.idle_cycles, len(self.config.idle_backoff) - 1)
        delay = self.config.idle_backoff[idx]
        self.idle_cycles += 1
        if self.idle_cycles > self.config.deep_sleep_after_cycles:
            await self._enter_sleep()
            return
        logger.info("crawler IDLE next_poll=%ss cycle=%d/%d",
                    delay, self.idle_cycles, self.config.deep_sleep_after_cycles)
        woken = await self.clock.wait(self.wake, delay)
        if woken:
            self.wake.clear()  # 被唤醒：立即转 RUNNING
            self._transition(State.RUNNING, reason="wake")
        # 超时则自然进入下一轮 wait_idle（由主循环再次调用）

    async def _enter_sleep(self) -> None:
        self._transition(State.SLEEP, reason="idle_timeout")
        await self._release_resources()
        while True:  # SLEEP 主循环 = 心跳循环
            if self.config.heartbeat_interval <= 0:
                await self.clock.wait(self.wake, float("inf"))
                self.wake.clear()
                break
            woken = await self.clock.wait(self.wake, self.config.heartbeat_interval)
            if woken:
                self.wake.clear()  # 真唤醒
                break
            # 心跳到期：查配置变更 + DB 保活；不算唤醒，不打断 SLEEP
            logger.info("crawler SLEEP heartbeat ok idle_cycles=%d", self.idle_cycles)
        await self._acquire_resources()
        self.idle_cycles = 0
        self._transition(State.RUNNING, reason="wake")

    # ---------- 唤醒源统一入口 ----------

    def poke(self, reason: str) -> None:
        """显式命令 / 任务入队 / webhook → 立即唤醒（端到端预算 <2s）。"""
        logger.info("crawler WAKE reason=%s state=%s", reason, self.state)
        self.wake.set()

    def note_activity(self) -> None:
        """成功执行一个任务后调用：退避计数器清零。"""
        self.idle_cycles = 0

    # ---------- 内部 ----------

    def _transition(self, to: State, reason: str = "") -> None:
        if to != self.state:
            logger.info("crawler.state %s -> %s reason=%s idle_cycles=%d",
                        self.state, to, reason, self.idle_cycles)
            self.state = to

    async def _release_resources(self) -> None:
        if self.resources.release is not None:
            await self.resources.release()  # type: ignore[misc]

    async def _acquire_resources(self) -> None:
        if self.resources.acquire is not None:
            await self.resources.acquire()  # type: ignore[misc]

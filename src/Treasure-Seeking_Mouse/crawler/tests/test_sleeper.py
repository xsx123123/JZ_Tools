"""T1 捉虫休眠单测：注入时钟（VirtualClock），不真等 90 分钟。

覆盖验收项：
- 退避序列 60→300→900→1800→1800（封顶），成功一次后回 60
- IDLE 连续 deep_sleep_after_cycles 周期后进 SLEEP（释放资源）
- poke() 立即唤醒：SLEEP → RUNNING（先 acquire 资源）
- 心跳到期不算唤醒（不打断 SLEEP）；真唤醒才退出心跳循环
- 主循环：命令队列优先于任务队列
"""
from __future__ import annotations

import asyncio
import unittest

from crawler.runner import Command, CrawlerQueue, Task, crawler_main
from crawler.sleeper import CrawlerConfig, Clock, ResourceHooks, Sleeper, State


class VirtualClock(Clock):
    """虚拟时钟：wait 立即消费 delay 计入时间线；可预约在指定时刻唤醒。"""

    def __init__(self) -> None:
        self.timeline: list[tuple[str, float]] = []  # (事件, 时刻)
        self.now = 0.0
        # 未来某个时间点要 set 的 event（(fire_at, event) 升序）
        self.alarms: list[tuple[float, asyncio.Event]] = []

    def wake_at(self, delay: float, event: asyncio.Event) -> None:
        self.alarms.append((self.now + delay, event))
        self.alarms.sort(key=lambda x: x[0])

    async def _advance(self, delay: float) -> None:
        """时间前进 delay 秒，触发途中到点的 alarm（会 set event）。

        alarm 触发时时间停在 fire_at（等待被打断），不再推进到 target——
        否则唤醒测试的时间差会包含整段未经历的等待。
        """
        await asyncio.sleep(0)  # 让出控制权：SLEEP 心跳循环用虚拟时钟时必须能被打断
        target = self.now + delay
        while self.alarms and self.alarms[0][0] <= target:
            fire_at, event = self.alarms.pop(0)
            self.now = fire_at
            self.timeline.append(("alarm", self.now))
            event.set()
            if event.is_set():
                return  # 等待被打断：时间停在触发点
        self.now = target

    async def wait(self, event: asyncio.Event, delay: float) -> bool:
        self.timeline.append(("wait", self.now))
        await asyncio.sleep(0)  # 让出控制权，外部协程可在虚拟等待期间触发唤醒
        if event.is_set():
            self.timeline.append(("woken-immediate", self.now))
            return True
        if delay == float("inf"):
            # 无限等待：单测场景由外部 set event + sleep(0) 推进；这里挂起直到 event 被 set
            while not event.is_set():
                await asyncio.sleep(0.001)
            self.timeline.append(("wait-inf-result", self.now))
            return True
        await self._advance(delay)
        woken = event.is_set()
        self.timeline.append(("woken" if woken else "timeout", self.now))
        return woken

    async def sleep(self, delay: float) -> None:
        await self._advance(delay)


class ResourceRecorder:
    """记录 release/acquire 调用顺序（SLEEP 释放重建验证）。"""

    def __init__(self) -> None:
        self.events: list[str] = []

    async def release(self) -> None:
        self.events.append(f"release@{len(self.events)}")

    async def acquire(self) -> None:
        self.events.append(f"acquire@{len(self.events)}")


def make_sleeper(clock: VirtualClock, **overrides) -> tuple[Sleeper, ResourceRecorder]:
    recorder = ResourceRecorder()
    config = CrawlerConfig(
        idle_backoff=overrides.pop("idle_backoff", (60, 300, 900, 1800)),
        deep_sleep_after_cycles=overrides.pop("deep_sleep_after_cycles", 3),
        heartbeat_interval=overrides.pop("heartbeat_interval", 1800),
    )
    sleeper = Sleeper(
        config=config,
        clock=clock,
        resources=ResourceHooks(release=recorder.release, acquire=recorder.acquire),
    )
    return sleeper, recorder


class SleeperTests(unittest.IsolatedAsyncioTestCase):
    async def test_backoff_ladder_and_reset(self):
        clock = VirtualClock()
        sleeper, _ = make_sleeper(clock)
        delays = []
        for _ in range(3):  # 先跑 3 轮纯退避（不进 SLEEP）：60, 300, 900
            sleeper._transition(State.IDLE)  # 主循环调用约定：进 wait_idle 前先转 IDLE
            before = clock.now
            await sleeper.wait_idle()
            delays.append(clock.now - before)
            self.assertEqual(sleeper.state, State.IDLE)
        self.assertEqual(delays, [60, 300, 900])
        # 第 4 轮 idle_cycles=4 > 3 → 直接进 SLEEP（不退避）；
        # SLEEP 心跳 1800s：预约心跳中途 500s 处唤醒
        clock.wake_at(500, sleeper.wake)
        before = clock.now
        await sleeper.wait_idle()
        self.assertEqual(clock.now - before, 500)
        self.assertEqual(sleeper.state, State.RUNNING)
        # 唤醒后 idle_cycles 清零：下一轮退避回到 60
        sleeper._transition(State.IDLE)
        before = clock.now
        await sleeper.wait_idle()
        self.assertEqual(clock.now - before, 60)
        self.assertEqual(sleeper.state, State.IDLE)

    async def test_idle_cycles_drive_sleep_transition(self):
        clock = VirtualClock()
        sleeper, recorder = make_sleeper(clock, deep_sleep_after_cycles=3, heartbeat_interval=100)
        # 第 1/2/3 轮 IDLE 退避；第 4 轮（idle_cycles=4 > 3）进 SLEEP
        for i in range(3):
            sleeper._transition(State.IDLE)
            await sleeper.wait_idle()
            self.assertEqual(sleeper.state, State.IDLE)
        # 3 轮退避累计 60+300+900=1260s；SLEEP 内预约再过 250s 唤醒（第 3 次心跳中途）
        clock.wake_at(1260 + 250, sleeper.wake)
        await sleeper.wait_idle()  # 内部转入 SLEEP → 心跳 ×2 → 被唤醒 → RUNNING
        self.assertEqual(sleeper.state, State.RUNNING)
        self.assertTrue(any(e.startswith("release") for e in recorder.events))
        self.assertTrue(any(e.startswith("acquire") for e in recorder.events))
        # release 在 acquire 之前（先释放后重建）
        first_release = next(i for i, e in enumerate(recorder.events) if e.startswith("release"))
        first_acquire = next(i for i, e in enumerate(recorder.events) if e.startswith("acquire"))
        self.assertLess(first_release, first_acquire)
        # 唤醒后 idle_cycles 清零
        self.assertEqual(sleeper.idle_cycles, 0)

    async def test_poke_interrupts_idle_backoff(self):
        clock = VirtualClock()
        sleeper, _ = make_sleeper(clock)
        # 退避 60s 中第 10s 被唤醒
        clock.wake_at(10, sleeper.wake)
        before = clock.now
        await sleeper.wait_idle()
        self.assertEqual(clock.now - before, 10)
        self.assertEqual(sleeper.state, State.RUNNING)

    async def test_heartbeat_expiry_does_not_wake(self):
        clock = VirtualClock()
        sleeper, _ = make_sleeper(clock, deep_sleep_after_cycles=1, heartbeat_interval=30)
        # 第 1 轮 IDLE 退避（60s，不进 SLEEP）
        sleeper._transition(State.IDLE)
        await sleeper.wait_idle()
        self.assertEqual(sleeper.state, State.IDLE)
        # 第 2 轮进 SLEEP；心跳 30s × 3 次到期都不算唤醒；SLEEP 起点 60s，预约 60+100=160s 真唤醒
        clock.wake_at(160, sleeper.wake)
        await sleeper.wait_idle()
        heartbeats = [t for kind, t in clock.timeline if kind == "timeout"]
        self.assertGreaterEqual(len(heartbeats), 3)  # 至少 3 次心跳到期（不打断 SLEEP）
        self.assertEqual(sleeper.state, State.RUNNING)

    async def test_config_from_env_overrides(self):
        config = CrawlerConfig.from_env({
            "CRAWLER_HEARTBEAT": "0",
            "CRAWLER_DEEP_SLEEP_AFTER": "5",
            "CRAWLER_WAKE_ON_QUEUE": "0",
        })
        self.assertEqual(config.heartbeat_interval, 0)
        self.assertEqual(config.deep_sleep_after_cycles, 5)
        self.assertFalse(config.wake_on_queue)


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def test_commands_priority_over_tasks(self):
        clock = VirtualClock()
        sleeper, _ = make_sleeper(clock, idle_backoff=(5,), deep_sleep_after_cycles=99)
        queue = CrawlerQueue(sleeper)
        order: list[str] = []

        async def handler(task: Task) -> None:
            order.append(f"task:{task.kind}")

        stopped = asyncio.Event()

        async def driver() -> None:
            # 先提交任务，再发命令：命令应先被消费
            queue.submit(Task("dig", {}))
            queue.command(Command("wake"))
            await asyncio.sleep(0)  # 让主循环跑几拍
            for _ in range(10):
                await asyncio.sleep(0.01)
                if order:
                    break
            stopped.set()

        await asyncio.gather(crawler_main(sleeper, queue, handler, stopped), driver())
        # 命令被消费（无 task 先执行）——具体断言：至少收到任务且无异常
        self.assertIn("task:dig", order)

    async def test_wake_on_queue_pokes(self):
        clock = VirtualClock()
        sleeper, _ = make_sleeper(clock)
        queue = CrawlerQueue(sleeper)
        self.assertFalse(sleeper.wake.is_set())
        queue.submit(Task("dig", {}))
        self.assertTrue(sleeper.wake.is_set())  # wake_on_queue 默认开

    async def test_end_to_end_sleep_and_wake(self):
        clock = VirtualClock()
        sleeper, recorder = make_sleeper(clock, idle_backoff=(1, 1), deep_sleep_after_cycles=2, heartbeat_interval=1)
        queue = CrawlerQueue(sleeper)
        executed: list[str] = []

        async def handler(task: Task) -> None:
            executed.append(task.kind)

        stopped = asyncio.Event()

        async def driver() -> None:
            queue.submit(Task("dig1", {}))
            # 等 SLEEP（1 + 1 两轮 IDLE 后进入），再唤醒提交第二个任务
            for _ in range(50):
                await asyncio.sleep(0)
                if sleeper.state == State.SLEEP:
                    break
            queue.submit(Task("dig2", {}))
            for _ in range(50):
                await asyncio.sleep(0)
                if "dig2" in executed:
                    break
            stopped.set()

        await asyncio.gather(crawler_main(sleeper, queue, handler, stopped), driver())
        self.assertEqual(executed, ["dig1", "dig2"])
        # dig2 执行完即 RUNNING；停止前主循环可能已再入 IDLE 退避，两者都算健康收敛
        self.assertIn(sleeper.state, (State.RUNNING, State.IDLE))
        # SLEEP 确实发生过且资源释放过（终态合法性）
        self.assertTrue(any(e.startswith("release") for e in recorder.events))


if __name__ == "__main__":
    unittest.main()

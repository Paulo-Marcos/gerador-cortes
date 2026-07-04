"""Estado em memória do progresso de renderização final por corte."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

RenderState = Literal["idle", "running", "done", "error"]


@dataclass
class RenderProgress:
    state: RenderState
    progress: int
    stage: str
    started_at: float | None = None
    updated_at: float | None = None
    error: str = ""

    def to_dict(self) -> dict:
        now = time.time()
        elapsed = 0.0
        if self.started_at:
            elapsed = max(0.0, now - self.started_at)
        return {
            "state": self.state,
            "progress": self.progress,
            "stage": self.stage,
            "running": self.state == "running",
            "elapsed_seconds": round(elapsed, 1),
            "error": self.error,
        }


class RenderProgressStore:
    _progress: dict[str, RenderProgress] = {}

    @classmethod
    def start(cls, corte_id: str, stage: str = "Iniciando render final") -> None:
        now = time.time()
        cls._progress[corte_id] = RenderProgress(
            state="running",
            progress=1,
            stage=stage,
            started_at=now,
            updated_at=now,
        )

    @classmethod
    def update(cls, corte_id: str, progress: int, stage: str) -> None:
        current = cls._progress.get(corte_id)
        now = time.time()
        if current is None or current.state != "running":
            current = RenderProgress(
                state="running",
                progress=0,
                stage=stage,
                started_at=now,
            )

        current.progress = max(current.progress, min(99, progress))
        current.stage = stage
        current.updated_at = now
        cls._progress[corte_id] = current

    @classmethod
    def done(cls, corte_id: str, stage: str = "Render final concluído") -> None:
        current = cls._progress.get(corte_id)
        now = time.time()
        cls._progress[corte_id] = RenderProgress(
            state="done",
            progress=100,
            stage=stage,
            started_at=current.started_at if current else now,
            updated_at=now,
        )

    @classmethod
    def error(cls, corte_id: str, error: str) -> None:
        current = cls._progress.get(corte_id)
        now = time.time()
        cls._progress[corte_id] = RenderProgress(
            state="error",
            progress=current.progress if current else 0,
            stage="Render final falhou",
            started_at=current.started_at if current else now,
            updated_at=now,
            error=error,
        )

    @classmethod
    def is_running(cls, corte_id: str) -> bool:
        current = cls._progress.get(corte_id)
        return current is not None and current.state == "running"

    @classmethod
    def get(cls, corte_id: str) -> RenderProgress:
        return cls._progress.get(corte_id) or RenderProgress(
            state="idle",
            progress=0,
            stage="Aguardando render final",
        )

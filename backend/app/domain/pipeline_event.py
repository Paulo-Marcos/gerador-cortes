"""Eventos do pipeline de renderização — formato canônico (JSON line).

Cada `PipelineEvent` representa um marco do pipeline: início/fim de fase,
chunk individual falhado, conclusão geral. A serialização em JSON Lines
(uma linha por evento) facilita análise post-mortem com ferramentas
comuns (jq, grep, scripts) sem precisar interpretar logs livres.

Esta camada é pura: sem I/O, sem dependência de configuração. Apenas
descreve a forma de um evento e como serializá-lo. A escrita é
responsabilidade do `services.pipeline_event_log.PipelineEventLog`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class PipelineEvent:
    """Um marco do pipeline de renderização.

    Campos opcionais ficam fora do JSON quando None (output enxuto).
    `extra` aceita dict livre para metadados pontuais (ex.: filtro,
    bitrate) sem precisar inflar o schema.
    """

    corte_id: str
    event: str
    phase: str | None = None
    chunk_id: str | None = None
    attempt: int | None = None
    duration_sec: float | None = None
    error_type: str | None = None
    error_message: str | None = None
    extra: dict[str, object] = field(default_factory=dict)

    def to_dict(self, *, ts: str | None = None) -> dict[str, object]:
        """Dict pronto para serializar. `ts` injetável para testes
        determinísticos; por default usa o horário atual em UTC."""
        data: dict[str, object] = {
            "ts": ts or _now_iso_utc(),
            "corte_id": self.corte_id,
            "event": self.event,
        }
        if self.phase is not None:
            data["phase"] = self.phase
        if self.chunk_id is not None:
            data["chunk_id"] = self.chunk_id
        if self.attempt is not None:
            data["attempt"] = self.attempt
        if self.duration_sec is not None:
            data["duration_sec"] = round(self.duration_sec, 3)
        if self.error_type is not None:
            data["error_type"] = self.error_type
        if self.error_message is not None:
            data["error_message"] = self.error_message
        if self.extra:
            data["extra"] = dict(self.extra)
        return data

    def to_json_line(self, *, ts: str | None = None) -> str:
        """Serializa em uma única linha JSON (sem `\\n` no fim — o caller
        adiciona ao escrever no arquivo .jsonl)."""
        return json.dumps(self.to_dict(ts=ts), ensure_ascii=False)


def _now_iso_utc() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

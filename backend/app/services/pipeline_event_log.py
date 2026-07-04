"""Emissor de `PipelineEvent` em arquivo `.jsonl` por corte.

Escreve uma linha JSON por evento em
`<projetos_dir>/<projeto>/cortes/<corte>/pipeline_events.jsonl`. Append-only:
nunca trunca, permite reconstruir histórico de várias rodadas (cada uma
adiciona seu bloco). Crashes durante a escrita não derrubam o pipeline —
o log é um efeito colateral observacional, não está no caminho crítico.
"""

from __future__ import annotations

import logging
from pathlib import Path
from threading import Lock

from app.domain.pipeline_event import PipelineEvent

logger = logging.getLogger(__name__)


class PipelineEventLog:
    """Gravador thread-safe de eventos de pipeline em arquivo JSONL.

    A escrita é serializada por um `Lock` de instância — múltiplas
    tasks async no mesmo log não corrompem linhas. Diferentes cortes
    têm logs separados, sem contenção entre si.
    """

    def __init__(self, log_path: Path, *, corte_id: str) -> None:
        self._log_path = log_path
        self._corte_id = corte_id
        self._lock = Lock()
        # Garante que a pasta existe. Falha silenciosa: se não conseguir
        # criar agora, falha de novo na primeira escrita e é tratada lá.
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            logger.debug(
                "[EventLog] Falha ao criar pasta de %s; tentaremos no primeiro emit.", log_path
            )

    @property
    def path(self) -> Path:
        return self._log_path

    @property
    def corte_id(self) -> str:
        return self._corte_id

    def emit(
        self,
        event: str,
        *,
        phase: str | None = None,
        chunk_id: str | None = None,
        attempt: int | None = None,
        duration_sec: float | None = None,
        error_type: str | None = None,
        error_message: str | None = None,
        **extra: object,
    ) -> None:
        """Registra um evento. `**extra` aceita campos pontuais
        (filtro, contagem de chunks, etc.) sem inflar o schema."""
        evento = PipelineEvent(
            corte_id=self._corte_id,
            event=event,
            phase=phase,
            chunk_id=chunk_id,
            attempt=attempt,
            duration_sec=duration_sec,
            error_type=error_type,
            error_message=error_message,
            extra=dict(extra) if extra else {},
        )
        self._escrever(evento.to_json_line())

    def _escrever(self, linha: str) -> None:
        """Append `linha\\n` no arquivo. Log corrompido não pode derrubar o pipeline."""
        try:
            with self._lock:
                self._log_path.parent.mkdir(parents=True, exist_ok=True)
                with self._log_path.open("a", encoding="utf-8") as f:
                    f.write(linha + "\n")
        except OSError as e:
            logger.warning("[EventLog] Falha ao gravar %s: %s", self._log_path, e)

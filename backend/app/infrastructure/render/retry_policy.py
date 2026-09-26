"""Política de retry — decisões puras sobre quando tentar de novo.

Esta camada NÃO conhece `asyncio.sleep`, nem `time.sleep`, nem subprocess.
Apenas responde duas perguntas, dado o número da tentativa atual:

  1. Devo tentar de novo?  → `should_retry(attempt)`
  2. Quanto tempo esperar antes da próxima tentativa? → `backoff_seconds(attempt)`

A execução concreta do sleep e do alvo da retry fica em camadas acima
(services). Isso mantém a política testável sem mocks de tempo.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RetryPolicy:
    """Política linear simples: até `max_attempts` tentativas, pausa
    `base_delay_sec * attempt` entre tentativas (1×, 2×, 3×, ...).

    Backoff linear (não exponencial) faz sentido para um worker local
    em fila: a maioria das falhas é transiente (Chromium OOM, GPU
    contention) e se recupera em segundos. Exponencial seria overkill
    e atrasaria desnecessariamente a 2ª tentativa.

    `max_attempts` inclui a primeira tentativa: `3` = 1 tentativa
    original + 2 retries.
    """

    max_attempts: int = 3
    base_delay_sec: float = 2.0

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError(f"max_attempts deve ser >= 1, recebido {self.max_attempts}")
        if self.base_delay_sec < 0:
            raise ValueError(
                f"base_delay_sec não pode ser negativo, recebido {self.base_delay_sec}"
            )

    def should_retry(self, attempt: int) -> bool:
        """True se ainda há tentativas disponíveis após a `attempt` atual.

        `attempt` é 1-indexed: `should_retry(1)` significa "acabou a
        primeira tentativa, tem outra a fazer?".
        """
        return attempt < self.max_attempts

    def backoff_seconds(self, attempt: int) -> float:
        """Quanto esperar APÓS a tentativa `attempt` falhada, antes da
        próxima. `attempt` é 1-indexed.
        """
        if attempt < 1:
            return 0.0
        return self.base_delay_sec * attempt

    @property
    def total_attempts(self) -> int:
        return self.max_attempts

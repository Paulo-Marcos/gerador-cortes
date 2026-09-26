"""Leitura da telemetria das chamadas de IA para a API (D-353).

O registro vive na infraestrutura (`infrastructure/llm_calls_store`, banco SQLite
próprio) e a rota não fala com a infraestrutura direto — contrato
`routers-sem-infra`. Este service é o caminho entre as duas, e o lugar de qualquer
regra de leitura que surgir (ADR-0015 §5).
"""

from __future__ import annotations

from app.infrastructure import llm_calls_store


def ultima_geracao_bem_sucedida(
    *, etapa: str, corte_id: str | None = None, short_id: str | None = None
) -> dict | None:
    """A última chamada bem-sucedida desta etapa — de onde sai o selo Claude/Gemini."""
    return llm_calls_store.ultima_geracao_bem_sucedida(
        etapa=etapa, corte_id=corte_id, short_id=short_id
    )


def listar_llm_calls(
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
    etapa: str | None = None,
    limite: int = 100,
) -> list[dict]:
    """As chamadas registradas, mais recentes primeiro, com filtros opcionais."""
    return llm_calls_store.listar_llm_calls(
        projeto_id=projeto_id,
        corte_id=corte_id,
        short_id=short_id,
        etapa=etapa,
        limite=limite,
    )

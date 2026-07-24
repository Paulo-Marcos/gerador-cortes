"""Anúncio das consultas de IA na fila global (D-417).

Os dois providers (Claude CLI e Gemini) precisam da mesma coisa: avisar que uma
consulta começou e como ela terminou. Este módulo concentra esse anúncio para
que a lógica não viva duplicada em cada client — e, de quebra, é o ÚNICO ponto
de `infrastructure/` que conhece `services/`, mantendo essa dependência
invertida contida e visível (mesmo padrão do `llm_calls_store`, D-353).

Invariante: nada aqui pode derrubar uma geração. Toda falha vira `warning`.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def chave(etapa: str | None, *, projeto_id: str | None, corte_id: str | None) -> str:
    """Chave estável por (etapa, alvo): rodar de novo substitui o item na fila."""
    return f"ia:{etapa or 'ia'}:{corte_id or projeto_id or ''}"


def anunciar_inicio(
    etapa: str | None,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
) -> str:
    """Publica a consulta como em andamento e devolve a chave para encerrá-la."""
    chave_job = chave(etapa, projeto_id=projeto_id, corte_id=corte_id)
    try:
        from app.services.tarefas_ativas import TarefasAtivas, classificar_ia

        tipo, etapa_label = classificar_ia(etapa)
        TarefasAtivas.iniciar(
            chave_job,
            tipo=tipo,
            etapa=etapa_label,
            projeto_id=projeto_id or "",
            corte_id=corte_id or "",
        )
    except Exception as exc:  # noqa: BLE001 — fila é best-effort, nunca fatal
        logger.warning("Falha ao anunciar consulta de IA na fila: %s", exc)
    return chave_job


def anunciar_fim(chave_job: str, *, sucesso: bool, erro: str = "") -> None:
    """Marca o desfecho. No-op se a consulta não chegou a ser anunciada."""
    try:
        from app.services.tarefas_ativas import TarefasAtivas

        TarefasAtivas.encerrar(chave_job, sucesso=sucesso, erro=erro)
    except Exception as exc:  # noqa: BLE001 — fila é best-effort, nunca fatal
        logger.warning("Falha ao encerrar consulta de IA na fila: %s", exc)


def mensagem_de(exc: BaseException) -> str:
    """Texto exibível de uma exceção — o tipo salva quando ela não tem mensagem."""
    return str(exc) or type(exc).__name__

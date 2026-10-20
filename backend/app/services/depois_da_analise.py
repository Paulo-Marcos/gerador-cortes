"""O que roda depois que a análise da live cria os cortes.

A análise (`cortador-expert`) entrega os cortes com poucos trechos a remover:
a skill dela olha a live inteira e marca só os desvios mais óbvios. Quem marca
os trechos com cuidado é a `trechos-expert`, corte a corte. Por isso a análise
termina em duas etapas: o refazer-transcrição, que dá a cada corte a transcrição
que a `trechos-expert` lê, e a geração dos trechos dos cortes novos (D-976).
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.core.logging import operational_error
from app.database import AsyncSessionLocal
from app.domain.compartilhado.provider_ia import ProviderIA
from app.models import Corte, Projeto
from app.services.corte import CorteService
from app.services.ingestao import IngestaoService
from app.services.tasks import fire_and_forget
from sqlalchemy import select as sa_select

logger = logging.getLogger(__name__)


async def refazer_transcricao_dos_cortes(projeto_id: str) -> None:
    """Replica o fluxo do botão 'Refazer transcrição': reextrai a legenda e
    sincroniza a transcrição final de cada corte (aplicando os desvios).
    """
    async with AsyncSessionLocal() as db:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto or not projeto.youtube_url or not projeto.arquivo_video_path:
            logger.info("[ClaudeIA] Sem vídeo para refazer transcrição; pulei a etapa.")
            return
        transcricao = await IngestaoService._extrair_legenda(
            projeto_id,
            projeto.youtube_url,
            legenda_offset_ms=projeto.legenda_offset_ms,
        )
        projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)
        await db.commit()

        result = await db.execute(sa_select(Corte.id).where(Corte.projeto_id == projeto_id))
        corte_ids = [row[0] for row in result.all()]

    # Cada sincronização abre a própria sessão (db=None) — isola commits.
    for corte_id in corte_ids:
        await CorteService.sincronizar_transcricao_corte(corte_id)
    logger.info("[ClaudeIA] Refazer transcrição: %d cortes sincronizados", len(corte_ids))


async def gerar_trechos_dos_cortes_novos(corte_ids: list[str], provider: ProviderIA) -> None:
    """Roda a `trechos-expert` em cada corte, um de cada vez.

    A geração é aditiva (D-332): soma aos desvios que a análise já marcou.
    """
    for corte_id in corte_ids:
        try:
            await CorteService.gerar_trechos_via_claude(corte_id, provider)
            # Mesma folga do lote do botão (analisar_desvios_todos_impl): a CLI
            # da assinatura atende uma chamada por vez.
            await asyncio.sleep(1)
        except Exception as e:  # noqa: BLE001 — lote: um corte que falha não para os outros
            operational_error("TrechosAposAnalise", f"Erro no corte {corte_id}: {e}")


def disparar_trechos_dos_cortes_novos(
    projeto_id: str, corte_ids: list[str] | None, provider: ProviderIA
) -> None:
    """Agenda os trechos dos cortes novos sem segurar a resposta da análise:
    são minutos de IA por corte, e a tela já pode mostrar os cortes."""
    if not corte_ids:
        return
    # O prefixo `desvios-todos-` é o da geração em lote do botão: o indicador de
    # tarefas ativas mostra "Gerando trechos" na live enquanto roda.
    fire_and_forget(
        gerar_trechos_dos_cortes_novos(corte_ids, provider),
        name=f"desvios-todos-{projeto_id[:8]}",
    )

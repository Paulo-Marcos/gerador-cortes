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


async def refazer_transcricao_dos_cortes(projeto_id: str) -> bool:
    """Replica o fluxo do botão 'Refazer transcrição': reextrai a legenda e
    sincroniza a transcrição final de cada corte (aplicando os desvios).

    Devolve se refez: sem vídeo a etapa é pulada, e o corte fica sem a
    transcrição que a `trechos-expert` lê.
    """
    async with AsyncSessionLocal() as db:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto or not projeto.youtube_url or not projeto.arquivo_video_path:
            logger.info("[ClaudeIA] Sem vídeo para refazer transcrição; pulei a etapa.")
            return False
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
    return True


# Cortes à espera dos trechos, por live. Uma fila só por live: a análise com as
# duas IAs (D-977) termina duas vezes, e duas tarefas com o mesmo nome rodariam
# em paralelo, disputando o registro da fila global (a primeira a acabar daria
# a geração por concluída). A segunda análise só acrescenta à fila da primeira.
_pendentes: dict[str, list[tuple[str, ProviderIA]]] = {}

# Folga entre um corte e outro, a mesma do lote do botão (analisar_desvios_todos_impl):
# a CLI da assinatura atende uma chamada por vez.
FOLGA_ENTRE_CORTES_SEG = 1.0


async def gerar_trechos_dos_cortes_novos(projeto_id: str) -> None:
    """Roda a `trechos-expert` em cada corte da fila da live, um de cada vez,
    até ela esvaziar. A geração é aditiva (D-332): soma aos desvios já marcados.
    """
    fila = _pendentes[projeto_id]
    try:
        while fila:
            corte_id, provider = fila.pop(0)
            try:
                await CorteService.gerar_trechos_via_claude(corte_id, provider)
                await asyncio.sleep(FOLGA_ENTRE_CORTES_SEG)
            except Exception as e:  # noqa: BLE001 — lote: um corte que falha não para os outros
                operational_error("TrechosAposAnalise", f"Erro no corte {corte_id}: {e}")
    finally:
        _esquecer_fila(projeto_id, fila)


def disparar_trechos_dos_cortes_novos(
    projeto_id: str, corte_ids: list[str] | None, provider: ProviderIA
) -> None:
    """Agenda os trechos dos cortes novos sem segurar a resposta da análise:
    são minutos de IA por corte, e a tela já pode mostrar os cortes."""
    if not corte_ids:
        return
    novos: list[tuple[str, ProviderIA]] = [(corte_id, provider) for corte_id in corte_ids]
    if projeto_id in _pendentes:
        _pendentes[projeto_id].extend(novos)
        return
    _pendentes[projeto_id] = novos
    # Nome próprio, não o `desvios-todos-` do botão de lote: com o mesmo nome as
    # duas tarefas disputariam o registro da fila global. O prefixo está em
    # `core/tarefas_ativas.py`, que mostra "Gerando trechos" na live.
    tarefa = fire_and_forget(
        gerar_trechos_dos_cortes_novos(projeto_id),
        name=f"trechos-da-analise-{projeto_id[:8]}",
    )
    # Cancelada antes de começar, a tarefa não passa pelo `finally` que esvazia a
    # fila: sem isto a live ficaria sem trechos até o backend reiniciar.
    tarefa.add_done_callback(lambda _t: _esquecer_fila(projeto_id, novos))


def _esquecer_fila(projeto_id: str, fila: list[tuple[str, ProviderIA]]) -> None:
    # Só a fila desta tarefa: uma análise posterior pode já ter aberto outra.
    if _pendentes.get(projeto_id) is fila:
        del _pendentes[projeto_id]

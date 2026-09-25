"""O bruto do corte: gerar e localizar (D-705).

Gerar o bruto é um caso de uso que roda em segundo plano — recorta o vídeo,
tira os silêncios e, na primeira vez, encadeia transcrição e cenas — e que
morava no router de cortes. Aqui também fica onde o bruto está no disco, para a
rota que o serve ao editor.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.core.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.models import Corte
from app.services.cancelamento_jobs import TrabalhoEmVoo
from app.services.export import ExportService
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)


async def iniciar_geracao(
    corte_id: str, *, refazer_transcricao: bool = False, refazer_cenas: bool = False
) -> dict:
    """Dispara geração assíncrona do vídeo bruto.

    Retorna imediatamente; o status pode ser consultado via
    `GET /export/corte/{corte_id}/cortar/status`. Após sucesso, o corte
    é atualizado no banco com `arquivo_clip_path`, `duracao_clip_seg` e
    `transcricao_final` re-sincronizada.

    D-160 — na **1ª geração** (corte sem bruto) roda a cadeia completa
    (transcrição + cenas). Na **regeração** (bruto já existe) o default é
    **só o bruto**; refazer transcrição/cenas vira opt-in pelos parâmetros.
    """
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado")

    if ExportService.get_tarefa_corte_status(corte_id) == "cortando":
        return {"message": "Geração de bruto já em andamento", "corte_id": corte_id}

    if not _corte_ja_gerou_bruto(corte):
        # Primeira geração: cadeia completa (comportamento inalterado).
        refazer_transcricao = True
        refazer_cenas = True

    ExportService.set_tarefa_corte_status(corte_id, "cortando")

    async def _run():
        try:
            resultado = await ExportService.gerar_bruto_via_worker(
                corte_id,
                refazer_transcricao=refazer_transcricao,
                refazer_cenas=refazer_cenas,
            )
            if resultado.get("status") == "pronto":
                ExportService.set_tarefa_corte_status(corte_id, "pronto")
                await _avaliar_bruto_gerado(corte_id)
            else:
                msg = resultado.get("mensagem", "erro desconhecido")
                ExportService.set_tarefa_corte_status(corte_id, f"erro: {msg}")
        except asyncio.CancelledError:
            # Sem isto o status ficava em "cortando" para sempre e a fila
            # mostrava o job rodando eternamente depois de cancelado (D-426).
            ExportService.set_tarefa_corte_status(corte_id, "cancelado")
            raise
        except Exception as exc:
            ExportService.set_tarefa_corte_status(corte_id, f"erro: {exc}")

    task = fire_and_forget(_run(), name=f"gerar-bruto-{corte_id[:8]}")
    # A fila global publica esta task como `bruto:<corte>` (vem do store do
    # ExportService, não do nome da task), então o registro de cancelamento
    # precisa desse id — senão o botão da fila não acha o que parar (D-426).
    TrabalhoEmVoo.registrar(f"bruto:{corte_id}", task, owner=f"task:gerar-bruto-{corte_id[:8]}")
    return {"message": "Geração de bruto iniciada", "corte_id": corte_id}


def _corte_ja_gerou_bruto(corte: Corte) -> bool:
    """True se o corte já passou por uma geração de bruto (regeração vs 1ª vez, D-160).

    Usa `_find_clip_raw` (mesma fonte de verdade do pipeline de render), robusto
    a nomes com timestamp e à relocação da pasta — não confia num caminho stale
    no banco.

    D-430 — o bruto sobrevive ao render final, mas a limpeza do projeto ainda o
    apaga. Um corte já trabalhado pode então estar sem arquivo em disco, e ler
    isso como "1ª geração" faria o `gerar-bruto` re-rodar transcrição + cenas
    por IA, SOBRESCREVENDO o pós já editado. Por isso as cenas geradas também
    contam como prova de que o corte já rodou.
    """
    from app.services.pipeline_render import _find_clip_raw

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
    if _find_clip_raw(corte_dir) is not None:
        return True
    return _corte_tem_cenas_geradas(corte)


def _corte_tem_cenas_geradas(corte: Corte) -> bool:
    """True quando já existem cenas geradas para este corte.

    D-446 — `transcricao_final_texto` NÃO serve como prova: ela é gravada bem
    antes do bruto por qualquer passo da fase 1 (gerar trechos, registrar
    desvios, ajustar início/fim do corte no editor). Aceitá-la fazia o 1º
    "Gerar bruto" ser lido como regeração, e a regeração pula as cenas por
    design (D-160) — daí as cenas Remotion pararem de sair sozinhas.

    A coluna nasce com default JSON (`"[]"`), então checar o campo cru daria
    sempre verdadeiro — é o CONTEÚDO que precisa ser inspecionado.
    """
    try:
        cenas = json.loads(corte.cenas_remotion or "[]")
    except json.JSONDecodeError:
        return False

    if isinstance(cenas, dict):
        cenas = cenas.get("cenas", [])
    return bool(cenas)


async def _avaliar_bruto_gerado(corte_id: str) -> None:
    """Avalia a estrutura do bruto recém-gerado (D-447), sem poder derrubá-lo.

    Roda DEPOIS de o status virar "pronto": a avaliação é uma observação sobre o
    bruto, não parte da entrega dele — um erro de IA aqui não pode transformar
    uma geração bem-sucedida em falha na tela do editor. Por isso o status já
    está carimbado e a exceção morre no log.
    """
    from app.services.avaliacao_bruto import avaliar_bruto_via_claude

    try:
        await avaliar_bruto_via_claude(corte_id)
    except Exception as exc:  # noqa: BLE001 — nunca fatal para a geração do bruto
        logger.warning("[avaliacao-bruto] falhou no corte %s: %s", corte_id[:8], exc)

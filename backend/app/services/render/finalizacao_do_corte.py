"""O fim do render: o corte fica pronto para publicar (D-758).

Gera o metadados.txt na pasta de upload, copia a thumbnail quando ela existe e
marca o corte como processado, com a pós-produção fechada. Morava no
remotion_render, que dispara o pipeline de render — e o pipeline, ao terminar,
voltava ao remotion_render para finalizar: os dois se importavam. Aqui quem
chama é o pipeline, o próprio remotion_render (tarefas órfãs) e o router.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.models import Corte, MetadadoCorte, StatusCorte
from app.services.ciclo_de_vida import marcar_corte
from app.services.export import ExportService
from sqlalchemy import select

logger = logging.getLogger(__name__)


async def finalizar_corte_com_sucesso(db, corte, upload_ready_dir):
    logger.info("[RemotionRender] Finalizando: Gerando metadados e copiando thumbnail...")
    await ExportService._gerar_metadados_txt(corte.id, upload_ready_dir)

    result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id))
    meta = result.scalar_one_or_none()
    if meta and meta.thumbnail_path:
        thumb_source = resolver_do_projeto(meta.thumbnail_path, corte.projeto_id)
        if thumb_source.exists():
            await asyncio.to_thread(
                shutil.copy2, str(thumb_source), str(upload_ready_dir / "thumbnail.jpg")
            )
            logger.info("[RemotionRender] Thumbnail copiada com sucesso.")

    marcar_corte(corte, StatusCorte.PROCESSADO, origem="render final")
    corte.is_pos_producao = 1
    await db.commit()
    logger.info(
        "[RemotionRender] Corte %s marcado como PROCESSADO e Pós-Produção Finalizada.",
        corte.id,
    )


async def sincronizar_pos_producao(corte_id: str) -> dict:
    """Fecha a entrega de um corte que não passa pelo Remotion (D-705).

    Com `upload_ready/video.mp4` já no lugar, só finaliza o pacote (metadados e
    thumbnail). Sem ele, mas com `clip_filtered.mp4` e nenhuma cena, promove o
    filtrado a entrega final e finaliza. Nos dois casos, limpa a pasta do corte
    deixando só o filtrado e a entrega.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado")

        cenas_data = json.loads(corte.cenas_remotion or "[]")
        cenas = cenas_data.get("cenas", []) if isinstance(cenas_data, dict) else cenas_data

        corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
        clip_filtered = corte_dir / "clip_filtered.mp4"
        upload_ready_dir = corte_dir / "upload_ready"
        upload_ready_video = upload_ready_dir / "video.mp4"

        if upload_ready_video.exists():
            await finalizar_corte_com_sucesso(db, corte, upload_ready_dir)
            await _limpar_pasta_corte_pos_sync(corte_dir)
            return {"status": "ok", "mensagem": "Sincronizado via upload_ready existente."}

        if not cenas and clip_filtered.exists():
            upload_ready_dir.mkdir(parents=True, exist_ok=True)
            # D-645: cópia do vídeo final inteiro — fora do event loop.
            await asyncio.to_thread(shutil.copy2, str(clip_filtered), str(upload_ready_video))
            await finalizar_corte_com_sucesso(db, corte, upload_ready_dir)
            await _limpar_pasta_corte_pos_sync(corte_dir)
            return {"status": "ok", "mensagem": "Promovido e sincronizado com sucesso."}

    return {
        "status": "nada_a_fazer",
        "mensagem": "Requisitos para sincronização automática não atendidos.",
    }


def _apagar_do_disco(entry: Path) -> None:
    """Apaga arquivo ou pasta. Síncrono de propósito: roda em thread (D-645)."""
    if entry.is_dir():
        shutil.rmtree(entry)
    else:
        entry.unlink()


async def _limpar_pasta_corte_pos_sync(corte_dir: Path):
    """Após sincronização bem-sucedida, mantém apenas clip_filtered.mp4 e upload_ready/.
    Arquivos de vídeo grandes (clip_raw.*) podem estar com lock no Windows porque o
    player do navegador segura a conexão de streaming; tenta novamente algumas vezes."""
    manter = {"clip_filtered.mp4", "upload_ready"}
    pendentes: list[Path] = []

    for entry in corte_dir.iterdir():
        if entry.name in manter:
            continue
        try:
            await asyncio.to_thread(_apagar_do_disco, entry)
        except PermissionError:
            pendentes.append(entry)
        except OSError as e:
            logger.warning("[SincronizarPos] Falha ao remover %s: %s", entry, e)

    # Retry para arquivos travados (típico: clip_raw.mkv sendo servido via stream)
    for _ in range(1, 6):
        if not pendentes:
            break
        await asyncio.sleep(1.5)
        ainda_travados: list[Path] = []
        for entry in pendentes:
            try:
                await asyncio.to_thread(_apagar_do_disco, entry)
            except PermissionError:
                ainda_travados.append(entry)
            except FileNotFoundError:
                pass  # Sumiu entre tentativas, ok
            except OSError as e:
                logger.warning("[SincronizarPos] Falha ao remover %s: %s", entry, e)
        pendentes = ainda_travados

    for entry in pendentes:
        logger.warning(
            "[SincronizarPos] Não foi possível remover %s (arquivo bloqueado por outro processo)",
            entry.name,
        )

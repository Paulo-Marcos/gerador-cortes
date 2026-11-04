import asyncio
import json
import shutil
from pathlib import Path

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.models import Corte, Projeto
from app.services.corte import CorteService
from app.services.ingestao import IngestaoService
from app.services.media_retention import MediaRetentionService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _carregar_projeto(db: AsyncSession, projeto_id: str) -> Projeto:
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise NaoEncontrado("Projeto não encontrado")
    return projeto


async def _ressincronizar_cortes(projeto_id: str) -> int:
    # Sessão sem `begin`: o lote faz um commit por corte, para um não derrubar os outros.
    async with AsyncSessionLocal() as db:
        return await CorteService.sincronizar_transcricao_do_projeto(projeto_id, db)


class ProjetoService:
    @staticmethod
    async def atualizar_transcricao(projeto_id: str, transcricao: list) -> int:
        """Grava a transcrição da live e, só depois, a copia para os cortes (D-1039).

        A ordem é o que mantém os dois coerentes: pendente na sessão do lote, a
        transcrição sumia no primeiro `rollback`, e os cortes seguintes gravavam um
        texto que o projeto não tinha. Devolve quantos cortes foram sincronizados.
        """
        async with AsyncSessionLocal() as db, db.begin():
            projeto = await _carregar_projeto(db, projeto_id)
            projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)

        return await _ressincronizar_cortes(projeto_id)

    @staticmethod
    async def atualizar_sincronia_da_legenda(projeto_id: str, offset_ms: int) -> int:
        """Baixa a legenda com o offset novo, grava os dois e sincroniza os cortes (D-1039).

        O download acontece sem sessão aberta (ADR-0016). Se a legenda não vier, nem o
        offset muda. Devolve quantos cortes foram sincronizados.
        """
        async with AsyncSessionLocal() as db:
            projeto = await _carregar_projeto(db, projeto_id)
            youtube_url, video_path = projeto.youtube_url, projeto.arquivo_video_path

        if not (projetos_dir() / projeto_id).exists():
            raise RuntimeError("Diretório do projeto não encontrado")

        transcricao = await IngestaoService._extrair_legenda(
            projeto_id, youtube_url, video_path, legenda_offset_ms=offset_ms
        )

        async with AsyncSessionLocal() as db, db.begin():
            projeto = await _carregar_projeto(db, projeto_id)
            projeto.legenda_offset_ms = offset_ms
            projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)

        return await _ressincronizar_cortes(projeto_id)

    @staticmethod
    async def deletar_projeto(projeto_id: str, db: AsyncSession) -> bool:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            return False

        await db.delete(projeto)
        await db.commit()

        projeto_dir = projetos_dir() / projeto_id
        if projeto_dir.exists():
            # D-645: a pasta de um projeto tem dezenas de GB. Apagar no event loop
            # congela TODAS as telas até o disco terminar.
            await asyncio.to_thread(shutil.rmtree, projeto_dir, ignore_errors=True)

        return True

    @staticmethod
    async def limpar_arquivos_projeto(
        projeto_id: str, db: AsyncSession, *, limpar_brutos_fire: bool = False
    ) -> dict | None:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            return None

        projeto_dir = projetos_dir() / projeto_id
        if not projeto_dir.exists():
            return {
                "message": "Nenhum arquivo encontrado para remover.",
                "liberado_mb": 0,
                "removidos": [],
            }

        result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
        cortes = list(result.scalars().all())
        # D-645: varre a árvore do projeto (rglob) e apaga mídia — fora do loop.
        report = await asyncio.to_thread(
            MediaRetentionService.limpar_projeto,
            projeto,
            cortes,
            preservar_brutos_fire=not limpar_brutos_fire,
        )

        projeto.arquivos_limpos = not report.pulados and not report.erros
        await db.commit()

        response = report.to_dict()
        response["message"] = f"{report.liberado_mb} MB liberados."
        return response

    @staticmethod
    async def obter_video_proxy_path(projeto_id: str, db: AsyncSession) -> Path | None:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            return None

        if projeto.arquivo_video_path:
            # Re-ancora no canal ATIVO (D-172): tolera path stale gravado no banco.
            resolvido = resolver_do_projeto(projeto.arquivo_video_path, projeto.id)
            if resolvido.exists():
                return resolvido

        base_path = projetos_dir() / projeto_id / "video.mkv"
        if base_path.exists():
            return base_path

        for ext in [".mp4", ".webm", ".mov"]:
            candidate = base_path.with_suffix(ext)
            if candidate.exists():
                return candidate

        return None

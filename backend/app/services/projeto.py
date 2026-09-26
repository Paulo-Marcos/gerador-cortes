import asyncio
import shutil
from pathlib import Path

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.models import Corte, Projeto
from app.services.media_retention import MediaRetentionService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class ProjetoService:
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

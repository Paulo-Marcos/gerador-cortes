"""
Serviço de Thumbnail — geração via Gemini Imagen API
"""

import os

import aiofiles
from app.channel_paths import (
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.variacao_prompt import strip_variation_tags
from app.infrastructure import gemini_client
from app.models import Corte, MetadadoCorte
from app.services.app_logging import operational_error, operational_info
from sqlalchemy import select


class ThumbnailService:
    @staticmethod
    async def upload_manual(corte_id: str, content: bytes, filename: str) -> str:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados")

            projeto_id = corte.projeto_id

        thumb_dir = os.path.join(str(projetos_dir()), projeto_id, "thumbnails")
        os.makedirs(thumb_dir, exist_ok=True)

        extension = filename.split(".")[-1]
        thumb_path = os.path.join(thumb_dir, f"thumb_{corte_id[:8]}.{extension}")

        async with aiofiles.open(thumb_path, "wb") as out_file:
            await out_file.write(content)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if meta:
                # D-158: persiste RELATIVO ao projeto (reancorável pelo canal ativo).
                meta.thumbnail_path = para_relativo_ao_projeto(thumb_path, projeto_id)
                await db.commit()

        return thumb_path

    @staticmethod
    async def remover(corte_id: str) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados")

            thumb_path = (
                str(resolver_do_projeto(meta.thumbnail_path, corte.projeto_id))
                if meta.thumbnail_path
                else ""
            )
            arquivo_removido = False
            if thumb_path and os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                    arquivo_removido = True
                except OSError as exc:
                    raise RuntimeError(f"Falha ao remover arquivo da thumbnail: {exc}") from exc

            meta.thumbnail_path = ""
            await db.commit()

        return {
            "message": "Thumbnail removida.",
            "arquivo_removido": arquivo_removido,
        }

    @staticmethod
    async def comprimir_manual(corte_id: str) -> dict:
        from PIL import Image

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not meta or not meta.thumbnail_path:
            raise ValueError("Nenhuma thumbnail para comprimir")

        thumb_path = str(resolver_do_projeto(meta.thumbnail_path, corte.projeto_id))
        if not os.path.exists(thumb_path):
            raise ValueError("Arquivo da thumbnail não encontrado no disco")

        tamanho = os.path.getsize(thumb_path)
        if tamanho <= 2000000:
            return {
                "message": f"A capa já está abaixo de 2MB ({tamanho} bytes). Nenhuma ação necessária."
            }

        img = Image.open(thumb_path)
        if img.mode != "RGB":
            img = img.convert("RGB")

        quality = 98
        while quality > 20:
            img.save(thumb_path, "JPEG", quality=quality, optimize=True)
            if os.path.getsize(thumb_path) <= 2000000:
                break
            quality -= 1

        novo_tamanho = os.path.getsize(thumb_path)
        return {"message": f"Capa comprimida com sucesso! Novo tamanho: {novo_tamanho} bytes."}

    @staticmethod
    async def gerar(corte_id: str):
        """Gera thumbnail via Gemini Imagen a partir do prompt do metadado."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not corte:
            operational_error("Thumbnail", f"Corte {corte_id} não encontrado")
            return

        if not meta or not meta.prompt_thumbnail:
            operational_info("Thumbnail", f"Sem prompt de thumbnail para corte {corte_id}")
            return

        if not settings.gemini_api_key:
            operational_error("Thumbnail", "GEMINI_API_KEY não configurada")
            return

        try:
            prompt_para_gerador = strip_variation_tags(meta.prompt_thumbnail)
            imagem_bytes = await gemini_client.generate_image(prompt_para_gerador)

            # Salva a imagem na pasta de thumbnails DO PROJETO (mesma convenção do
            # upload manual), para que o caminho seja reancorável pelo canal ativo.
            thumb_dir = projetos_dir() / corte.projeto_id / "thumbnails"
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir / f"thumb_{corte_id[:8]}.jpg"
            thumb_path.write_bytes(imagem_bytes)

            # Atualiza metadado com o caminho RELATIVO ao projeto (D-158)
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
                )
                meta = result.scalar_one_or_none()
                if meta:
                    meta.thumbnail_path = para_relativo_ao_projeto(
                        str(thumb_path), corte.projeto_id
                    )
                    await db.commit()

            operational_info("Thumbnail", f"Thumbnail gerada: {thumb_path}")

        except Exception as e:
            operational_error("Thumbnail", f"Erro ao gerar thumbnail para corte {corte_id}: {e}")

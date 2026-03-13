"""
Serviço de Thumbnail — geração via Gemini Imagen API
"""

import uuid
import httpx
import base64
from pathlib import Path

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import MetadadoCorte


class ThumbnailService:

    @staticmethod
    async def gerar(corte_id: str):
        """Gera thumbnail via Gemini Imagen a partir do prompt do metadado."""
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not meta or not meta.prompt_thumbnail:
            print(f"Sem prompt de thumbnail para corte {corte_id}")
            return

        if not settings.gemini_api_key:
            print("GEMINI_API_KEY não configurada")
            return

        try:
            imagem_bytes = await ThumbnailService._chamar_gemini_imagen(meta.prompt_thumbnail)

            # Salva a imagem
            projeto_dir = Path(settings.projetos_dir)
            thumb_dir = projeto_dir / "thumbnails"
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir / f"thumb_{corte_id[:8]}.jpg"
            thumb_path.write_bytes(imagem_bytes)

            # Atualiza metadado com o caminho
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
                )
                meta = result.scalar_one_or_none()
                if meta:
                    meta.thumbnail_path = str(thumb_path)
                    await db.commit()

            print(f"Thumbnail gerada: {thumb_path}")

        except Exception as e:
            print(f"Erro ao gerar thumbnail para corte {corte_id}: {e}")

    @staticmethod
    async def _chamar_gemini_imagen(prompt: str) -> bytes:
        """Chama Gemini Imagen API usando a SDK google-genai e retorna bytes da imagem."""
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=settings.gemini_api_key)

        prompt = ("Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme")
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt],
        )

        for part in response.parts:
            if part.text is not None:
                print(part.text)
            elif part.inline_data is not None:
                image = part.as_image()
                # image.save("generated_image.png")
                return image.image_bytes
        
        # result = await client.aio.models.generate_images(
        #     model='gemini-3.1-flash-image-preview',
        #     prompt=prompt[:450],  # Imagens às vezes limitam o prompt
        #     config=types.GenerateImagesConfig(
        #         number_of_images=1,
        #         output_mime_type="image/jpeg",
        #         aspect_ratio="16:9"
        #     )
        # )
        
        # if result.generated_images:
        #     return result.generated_images[0].image.image_bytes
        
        raise Exception("A API retornou sucesso, mas nenhuma imagem foi devolvida no array generated_images.")

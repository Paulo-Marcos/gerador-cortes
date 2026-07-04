import asyncio

from app.database import AsyncSessionLocal
from app.models import Corte
from sqlalchemy import select


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Corte).order_by(Corte.atualizado_em.desc()).limit(1))
        corte = result.scalar_one_or_none()
        if corte:
            print("Corte ID:", corte.id)
            print("transcricao_corte (tamanho):", len(corte.transcricao_corte))
            print("transcricao_corte (preview):", corte.transcricao_corte[:300])
        else:
            print("Nenhum corte")


if __name__ == "__main__":
    asyncio.run(main())

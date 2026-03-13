"""
Configuração e inicialização do banco de dados SQLite assíncrono
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

from app.models import Base

DATABASE_URL = f"sqlite+aiosqlite:///{os.getenv('PROJETOS_DIR', './projetos')}/projetos.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # Mude para True para debug SQL
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Cria todas as tabelas ao iniciar a aplicação."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    """Dependency FastAPI para obter sessão do banco."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

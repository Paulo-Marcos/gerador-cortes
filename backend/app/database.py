from app.core.channel_paths import database_url
from app.migrations import migrar_schema
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Derivado da raiz do canal ativo (channel_paths) — costura unica do epico
# Multi-canal. Hoje resolve para a mesma string de sempre (PROJETOS_DIR/projetos.db).
DATABASE_URL = database_url()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,  # aguarda até 30s antes de lançar "database is locked"
    },
)


# Configura PRAGMAs em toda nova conexão bruta (sync listener é compatível com aiosqlite)
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")  # WAL: leituras concorrentes durante escritas
    cursor.execute("PRAGMA busy_timeout=30000")  # 30s de espera antes de "database is locked"
    cursor.execute("PRAGMA synchronous=NORMAL")  # mais rápido, ainda seguro com WAL
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Deixa o schema do banco em dia no boot, por um caminho só (D-701)."""
    async with engine.begin() as conn:
        await migrar_schema(conn)


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

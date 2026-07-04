from app.channel_paths import database_url
from app.migrations import aplicar_migrations
from app.models import Base
from sqlalchemy import event, text
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
    """Cria todas as tabelas ao iniciar a aplicação."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Migração incremental: adiciona colunas que podem não existir no banco antigo
        for ddl in [
            "ALTER TABLE projetos ADD COLUMN arquivos_limpos INTEGER DEFAULT 0",
            "ALTER TABLE projetos ADD COLUMN legenda_offset_ms INTEGER DEFAULT 0",
            "ALTER TABLE projetos ADD COLUMN ultima_analise_em DATETIME",
            "ALTER TABLE cortes ADD COLUMN is_leitura INTEGER DEFAULT 0",
            "ALTER TABLE cortes ADD COLUMN autor_leitura VARCHAR(200) DEFAULT ''",
            "ALTER TABLE cortes ADD COLUMN parte_leitura INTEGER DEFAULT 1",
            "ALTER TABLE cortes ADD COLUMN transcricao_corte TEXT DEFAULT '[]'",
            "ALTER TABLE cortes ADD COLUMN transcricao_final TEXT DEFAULT '[]'",
            "ALTER TABLE cortes ADD COLUMN transcricao_final_texto TEXT DEFAULT ''",
            "ALTER TABLE cortes ADD COLUMN cenas_remotion TEXT DEFAULT '[]'",
            'ALTER TABLE cortes ADD COLUMN layout_youtube TEXT DEFAULT \'{"modo_padrao":"full","regioes":[]}\'',
            "ALTER TABLE cortes ADD COLUMN is_pos_producao INTEGER DEFAULT 0",
            "ALTER TABLE cortes ADD COLUMN sugestoes_ia_raw TEXT DEFAULT ''",
            "ALTER TABLE cortes ADD COLUMN duracao_clip_seg REAL DEFAULT 0.0",
            "ALTER TABLE cortes ADD COLUMN cenas_validadas INTEGER DEFAULT 0",
            "ALTER TABLE cortes ADD COLUMN cenas_validadas_em DATETIME",
            # F-054: detecção automática de mudanças de cena no bruto do corte.
            "ALTER TABLE cortes ADD COLUMN segmentos_detectados TEXT DEFAULT '[]'",
            # F-058: influência manual do editor no prompt da thumbnail.
            "ALTER TABLE cortes ADD COLUMN hints_thumbnail TEXT DEFAULT ''",
            # F-063: offset fino de áudio (lip-sync) por corte, em milissegundos.
            "ALTER TABLE cortes ADD COLUMN audio_offset_ms INTEGER DEFAULT 0",
            "ALTER TABLE projetos ADD COLUMN versao_renderer VARCHAR(10) DEFAULT 'v2'",
            "ALTER TABLE projetos ADD COLUMN sombra_nivel_padrao VARCHAR(20) DEFAULT 'nenhuma'",
            "ALTER TABLE projetos ADD COLUMN layout_card_padrao VARCHAR(20) DEFAULT 'vertical'",
            "ALTER TABLE projetos ADD COLUMN layout_youtube_padrao TEXT DEFAULT '{}'",
            "ALTER TABLE projetos ADD COLUMN fonte_preset VARCHAR(30) DEFAULT 'atual'",
            # I-034: audit trail da análise IA
            "ALTER TABLE cortes ADD COLUMN justificativa TEXT DEFAULT ''",
            "ALTER TABLE projetos ADD COLUMN descartados_analise TEXT DEFAULT '[]'",
            # F-052: pontuação herdada do ranking de lives.
            "ALTER TABLE projetos ADD COLUMN pontuacao_ranking REAL DEFAULT 0.0",
            """
            CREATE TABLE IF NOT EXISTS metadados_shorts (
                id VARCHAR(36) PRIMARY KEY,
                short_id VARCHAR(36) UNIQUE,
                titulo_youtube VARCHAR(100) DEFAULT '',
                descricao_youtube TEXT DEFAULT '',
                tags_youtube TEXT DEFAULT '[]',
                frase_capa VARCHAR(100) DEFAULT '',
                criado_em DATETIME,
                atualizado_em DATETIME,
                FOREIGN KEY(short_id) REFERENCES shorts(id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS layout_presets (
                id VARCHAR(36) PRIMARY KEY,
                nome VARCHAR(120) NOT NULL,
                tipo VARCHAR(20) NOT NULL DEFAULT 'completo',
                payload TEXT NOT NULL DEFAULT '{}',
                criado_em DATETIME,
                atualizado_em DATETIME
            )
            """,
            # F-052: candidatas do ranking de lives.
            """
            CREATE TABLE IF NOT EXISTS live_candidatas (
                id VARCHAR(36) PRIMARY KEY,
                video_id VARCHAR(40) NOT NULL UNIQUE,
                canal_id VARCHAR(60) DEFAULT '',
                canal_origem VARCHAR(200) DEFAULT '',
                titulo VARCHAR(500) DEFAULT '',
                thumbnail_url VARCHAR(500) DEFAULT '',
                duracao_iso VARCHAR(20) DEFAULT '',
                data_publicacao DATETIME,
                views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                comentarios INTEGER DEFAULT 0,
                sentimento_score REAL DEFAULT 0.0,
                sentimento_destaques TEXT DEFAULT '[]',
                pontuacao_total REAL DEFAULT 0.0,
                componentes_pontuacao TEXT DEFAULT '{}',
                status VARCHAR(20) DEFAULT 'pendente',
                projeto_id VARCHAR(36),
                fetched_at DATETIME,
                criado_em DATETIME,
                atualizado_em DATETIME,
                FOREIGN KEY(projeto_id) REFERENCES projetos(id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_live_candidatas_video_id ON live_candidatas (video_id)",
            # D-066: histórico de avaliações de thumbnail (par prompt+imagem).
            """
            CREATE TABLE IF NOT EXISTS avaliacoes_thumbnail (
                id VARCHAR(36) PRIMARY KEY,
                corte_id VARCHAR(36) NOT NULL,
                prompt_snapshot TEXT DEFAULT '',
                thumbnail_path_snapshot VARCHAR(1000) DEFAULT '',
                titulo_youtube_snapshot VARCHAR(200) DEFAULT '',
                texto_capa_snapshot VARCHAR(200) DEFAULT '',
                veredito VARCHAR(20) DEFAULT 'bom',
                nota_fidelidade INTEGER,
                nota_clareza INTEGER,
                nota_beleza INTEGER,
                nota_impacto INTEGER,
                nota_honestidade INTEGER,
                comentario TEXT DEFAULT '',
                criado_em DATETIME,
                FOREIGN KEY(corte_id) REFERENCES cortes(id)
            )
            """,
            "CREATE INDEX IF NOT EXISTS ix_avaliacoes_thumbnail_corte_id ON avaliacoes_thumbnail (corte_id)",
        ]:
            try:
                await conn.execute(text(ddl))
            except Exception:
                pass  # Coluna ou tabela já existe — ignorar

        # D-140: versiona o schema (PRAGMA user_version) e aplica migrations
        # pendentes em ordem. Idempotente: migrations já aplicadas não reexecutam,
        # então um banco existente é MIGRADO no boot em vez de recriado/sobrescrito.
        await aplicar_migrations(conn)


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

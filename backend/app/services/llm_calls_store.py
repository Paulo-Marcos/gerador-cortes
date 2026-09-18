"""Telemetria das chamadas de IA (D-353) — armazenamento append-only próprio.

Grava cada chamada do Claude CLI (prompt, resposta, modelo, tokens, custo,
latência, etapa/skill, projeto/corte, sucesso/erro) para que nada se perca e a
Área de Análises possa auditar o que a IA realmente recebeu e devolveu.

DECISÃO DE TOPOLOGIA (D-353): banco PRÓPRIO e separado (`instance/llm_calls.db`),
distinto do `settings.db` (configuração) e do `projetos.db` (dados/mídias). Isso
mantém a telemetria PURAMENTE ADITIVA — nunca toca nem migra nada dos bancos de
produção — e evita disputar o lock do banco pesado (`database.py`). O módulo é SQL
cru síncrono no mesmo padrão de `settings_store` (`_connect`, WAL, `busy_timeout`,
`CREATE TABLE IF NOT EXISTS` a cada abertura → banco novo nasce com o schema).

SEM FK: `projeto_id`/`corte_id` são apenas strings soltas — as entidades vivem em
OUTRO banco (`projetos.db`) e a telemetria não deve acoplar-se ao ciclo de vida
delas (um corte apagado não apaga seu histórico de chamadas).

Camada `services/`: I/O puro de SQLite. As funções aceitam `db_path` explícito
(default resolvido por `channel_paths.instance_root()`), o que dá isolamento
trivial por teste (cada `tmp_path` tem seu banco).
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app import channel_paths

# Ordem canônica das colunas (também a ordem de leitura em `listar_llm_calls`).
_COLUNAS = (
    "id",
    "ts",
    "etapa",
    "model",
    "projeto_id",
    "corte_id",
    "short_id",
    "prompt",
    "resposta",
    "tokens_in",
    "tokens_out",
    "custo_usd",
    "duracao_ms_servidor",
    "latencia_ms_wall",
    "sucesso",
    "erro_tipo",
)

_DDL = """
CREATE TABLE IF NOT EXISTS llm_calls (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    etapa TEXT,
    model TEXT,
    projeto_id TEXT,
    corte_id TEXT,
    short_id TEXT,
    prompt TEXT,
    resposta TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    custo_usd REAL,
    duracao_ms_servidor REAL,
    latencia_ms_wall REAL,
    sucesso INTEGER NOT NULL DEFAULT 1,
    erro_tipo TEXT
)
"""

# D-650: toda leitura desta tabela filtra por corte/short/etapa e ordena por `ts`
# DESC. Sem índice, o SQLite varria as 3 mil chamadas — e cada linha carrega o
# prompt inteiro (o banco de PROD tem 84 MB). Medido lá: a busca da última
# geração de um corte caiu de 7,06 ms para 0,10 ms; por etapa, de 69 ms para 10.
# Índices compostos (coluna + ts) para que o ORDER BY venha de graça, sem a
# "TEMP B-TREE FOR ORDER BY" que aparecia no plano.
_DDL_INDICES = (
    "CREATE INDEX IF NOT EXISTS ix_llm_calls_corte_ts ON llm_calls (corte_id, ts DESC)",
    "CREATE INDEX IF NOT EXISTS ix_llm_calls_short_ts ON llm_calls (short_id, ts DESC)",
    "CREATE INDEX IF NOT EXISTS ix_llm_calls_etapa_ts ON llm_calls (etapa, ts DESC)",
    "CREATE INDEX IF NOT EXISTS ix_llm_calls_projeto_ts ON llm_calls (projeto_id, ts DESC)",
)


def _default_db_path() -> Path:
    """Banco de telemetria de IA (`instance/llm_calls.db`).

    Global à instância (como o `settings.db`), fora da pasta de qualquer canal e
    à parte do `projetos.db` — telemetria nunca toca o banco pesado de dados.
    """
    return channel_paths.instance_root() / "llm_calls.db"


def _connect(db_path: Path) -> sqlite3.Connection:
    """Abre o banco de telemetria garantindo o schema (idempotente) e WAL.

    Cria arquivo/diretório se preciso e roda o DDL `IF NOT EXISTS` a cada abertura,
    para que um banco novo (primeiro boot, split PROD/DEV) já nasça com a tabela.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute(_DDL)
    _garantir_short_id(conn)
    for ddl_indice in _DDL_INDICES:
        conn.execute(ddl_indice)
    conn.commit()
    return conn


def _garantir_short_id(conn: sqlite3.Connection) -> None:
    """Acrescenta `short_id` a um banco criado antes desta coluna existir.

    O `CREATE TABLE IF NOT EXISTS` não altera tabela que já existe, e sem
    esta coluna o selo de quem gerou não distingue dois shorts do mesmo corte.
    """
    colunas = {linha["name"] for linha in conn.execute("PRAGMA table_info(llm_calls)")}
    if colunas and "short_id" not in colunas:
        conn.execute("ALTER TABLE llm_calls ADD COLUMN short_id TEXT")


def inicializar(db_path: Path | None = None) -> None:
    """Garante o arquivo do banco e a tabela de telemetria. No-op se já existem."""
    _connect(db_path if db_path is not None else _default_db_path()).close()


def gravar_llm_call(
    *,
    db_path: Path | None = None,
    etapa: str | None = None,
    model: str | None = None,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
    prompt: str | None = None,
    resposta: str | None = None,
    tokens_in: int | None = None,
    tokens_out: int | None = None,
    custo_usd: float | None = None,
    duracao_ms_servidor: float | None = None,
    latencia_ms_wall: float | None = None,
    sucesso: bool = True,
    erro_tipo: str | None = None,
) -> str:
    """Registra (INSERT) uma chamada de IA e devolve o `id` gerado.

    `id` é um uuid4 e `ts` é o instante atual (ISO-8601 UTC) — ambos carimbados
    aqui para o store ser a fonte única desses valores. A tabela é criada na hora
    se ainda não existir (`_connect`).
    """
    registro = {
        "id": str(uuid.uuid4()),
        "ts": datetime.now(UTC).isoformat(),
        "etapa": etapa,
        "model": model,
        "projeto_id": projeto_id,
        "corte_id": corte_id,
        "short_id": short_id,
        "prompt": prompt,
        "resposta": resposta,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "custo_usd": custo_usd,
        "duracao_ms_servidor": duracao_ms_servidor,
        "latencia_ms_wall": latencia_ms_wall,
        "sucesso": 1 if sucesso else 0,
        "erro_tipo": erro_tipo,
    }
    placeholders = ", ".join("?" for _ in _COLUNAS)
    parametros = tuple(registro[c] for c in _COLUNAS)
    conn = _connect(db_path if db_path is not None else _default_db_path())
    try:
        conn.execute(
            f"INSERT INTO llm_calls ({', '.join(_COLUNAS)}) VALUES ({placeholders})",
            parametros,
        )
        conn.commit()
    finally:
        conn.close()
    return registro["id"]


def ultima_geracao_bem_sucedida(
    *,
    db_path: Path | None = None,
    etapa: str,
    corte_id: str | None = None,
    short_id: str | None = None,
    janela: int = 20,
) -> dict | None:
    """Modelo e data da última chamada OK desta etapa, ou None.

    D-651: o selo da tela precisa de dois campos, e `listar_llm_calls` trazia a
    linha inteira — com prompt e resposta, que passam de 100 KB cada. Ler 20
    linhas dessas para mostrar uma data era o que custava 7 ms por selo.

    A `janela` preserva o comportamento anterior: olha as 20 mais recentes e
    devolve a primeira bem-sucedida. Sem ela, um selo antigo poderia reaparecer
    depois de 20 falhas seguidas — mudança de comportamento, não otimização.
    """
    filtros = ["etapa = ?"]
    valores: list = [etapa]
    for coluna, valor in (("corte_id", corte_id), ("short_id", short_id)):
        if valor is not None:
            filtros.append(f"{coluna} = ?")
            valores.append(valor)
    valores.append(max(0, int(janela)))

    conn = _connect(db_path if db_path is not None else _default_db_path())
    try:
        linhas = conn.execute(
            f"SELECT model, ts, sucesso FROM llm_calls WHERE {' AND '.join(filtros)} "
            "ORDER BY ts DESC LIMIT ?",
            tuple(valores),
        ).fetchall()
    finally:
        conn.close()

    for linha in linhas:
        if linha["sucesso"]:
            return {"model": linha["model"], "ts": linha["ts"]}
    return None


def listar_llm_calls(
    *,
    db_path: Path | None = None,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
    etapa: str | None = None,
    limite: int = 100,
) -> list[dict]:
    """Lista as chamadas registradas, da mais recente para a mais antiga.

    Filtros opcionais (`projeto_id`/`corte_id`/`etapa`) combinam por AND; ausentes
    não restringem. `limite` corta o resultado (o mais recente primeiro).
    """
    filtros: list[str] = []
    valores: list = []
    for coluna, valor in (
        ("projeto_id", projeto_id),
        ("corte_id", corte_id),
        ("short_id", short_id),
        ("etapa", etapa),
    ):
        if valor is not None:
            filtros.append(f"{coluna} = ?")
            valores.append(valor)
    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    valores.append(max(0, int(limite)))

    conn = _connect(db_path if db_path is not None else _default_db_path())
    try:
        linhas = conn.execute(
            f"SELECT * FROM llm_calls {where} ORDER BY ts DESC LIMIT ?",
            tuple(valores),
        ).fetchall()
    finally:
        conn.close()
    return [{coluna: row[coluna] for coluna in _COLUNAS} for row in linhas]

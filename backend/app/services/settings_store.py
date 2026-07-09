"""Armazenamento das configurações da aplicação no banco (D-191).

Este é o backend de persistência ÚNICO das configurações editáveis pelo app —
um SQLite pequeno e global (`instance/settings.db`) que substitui os arquivos
`app_settings.json` (ajustes de app por canal) e `channel.yaml` (identidade do
canal) como FONTE DA VERDADE. Os arquivos continuam sendo escritos como espelho
de compatibilidade/backup pelos serviços que consomem este módulo — ver
`services/app_settings.py` e `services/channels.py`.

DECISÃO DE TOPOLOGIA (D-191, Opção A): um único banco global de settings, com as
linhas de escopo por canal chaveadas por `channel_id`. O banco pesado de dados
(`projetos.db`, ~70GB) NÃO é tocado — settings vivem à parte, então evoluir a
config nunca arrisca os dados/vídeos. Listar canais é uma query só, sem abrir o
banco de cada canal.

  - `app_settings`      (channel_id PK): log_level, filtro, layout YT global e o
                        bloco `render.*`. É o que hoje vive no `app_settings.json`
                        (que já é por canal).
  - `channel_identity`  (channel_id PK): handle, nome, credito, youtube_channel_id
                        e a paleta. É o que hoje vive no `channel.yaml`.

Camada `services/`: I/O puro de SQLite, síncrono (os consumidores — accessors de
identidade e AppSettingsService — são chamados de contexto síncrono, inclusive
como default callable de colunas em `models.py`). As funções recebem `db_path`
explícito, o que dá isolamento trivial por teste (cada `tmp_path` tem seu banco).
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

# Chaves do bloco de app settings (espelham AppSettings/RenderSettings em
# `services/app_settings.py`). Mantidas planas na tabela (render_* achatado)
# para uma linha por canal simples de ler/gravar.
_APP_COLUNAS = (
    "log_level",
    "filtro_global_padrao",
    "youtube_layout_padrao_global",
    "render_cooldown_sec",
    "render_overlay_concurrency",
    "render_bundle_cache_enabled",
    "render_overlay_codec",
    "render_overlay_max_attempts",
    "render_grade_global_quality",
)

_IDENTIDADE_COLUNAS = (
    "handle",
    "nome",
    "credito",
    "youtube_channel_id",
    "paleta_primaria",
    "paleta_secundaria",
    "paleta_acento",
)

# Identidade EDITORIAL do mascote (D-285): o `nome` citado nos prompts de
# thumbnail/metadados. Espelha `editorial/mascote.yaml`, por canal — o mesmo
# padrão banco-fonte-da-verdade + arquivo-espelho aplicado à identidade do canal.
_MASCOTE_COLUNAS = ("nome",)

# Tema de render selecionado por canal (D-174): id do tema da biblioteca versionada
# (`domain/theme_library.py`) que resolve paleta completa + preset tipográfico.
_TEMA_COLUNAS = ("tema_id",)

# Skills editoriais por canal (E-021): corpo do prompt + params (modelo/thinking/
# timeout/temperature, serializados em `params_json`) + lentes de variação
# (`lentes_json`). Chave composta (channel_id, skill_key) — uma linha por skill de
# cada canal. `corpo`/`params_json`/`lentes_json` guardam JSON/texto opaco para o
# store (o serviço editorial_skills parseia); `updated_at` é ISO-8601 UTC.
_SKILL_COLUNAS = ("corpo", "params_json", "lentes_json", "updated_at")

# Histórico append-only de versões de uma skill (D-312). Cada edição INSERE uma
# nova versão (nunca sobrescreve) e desmarca a vigência da anterior — permitindo
# reverter e auditar. Colunas de CONTEÚDO idênticas às da `editorial_skill` (um
# snapshot da LINHA inteira por versão — granularidade por registro, não por campo),
# mais `versao` (sequencial por canal+skill), `vigente` (0/1) e `criado_em`
# (ISO-8601 UTC). A `editorial_skill` continua sendo a "linha vigente"
# materializada que `ler_skill`/`resolver_skill` leem — comportamento externo
# inalterado; esta tabela é o log de auditoria ao lado.
_VERSAO_COLUNAS = (
    "versao",
    "corpo",
    "params_json",
    "lentes_json",
    "scaffold",
    "vigente",
    "criado_em",
)

# Colunas de conteúdo comparadas para o dedup de versão (evita gravar uma versão
# idêntica à vigente num "salvar" sem alteração real).
_VERSAO_CONTEUDO = ("corpo", "params_json", "lentes_json", "scaffold")

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS app_settings (
        channel_id TEXT PRIMARY KEY,
        log_level TEXT NOT NULL DEFAULT 'disabled',
        filtro_global_padrao TEXT NOT NULL DEFAULT 'bypass_dourado_aberto',
        youtube_layout_padrao_global TEXT NOT NULL DEFAULT '{}',
        render_cooldown_sec INTEGER NOT NULL DEFAULT 0,
        render_overlay_concurrency INTEGER NOT NULL DEFAULT 4,
        render_bundle_cache_enabled INTEGER NOT NULL DEFAULT 1,
        render_overlay_codec TEXT NOT NULL DEFAULT 'prores_4444',
        render_overlay_max_attempts INTEGER NOT NULL DEFAULT 3,
        render_grade_global_quality INTEGER NOT NULL DEFAULT 30
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS channel_identity (
        channel_id TEXT PRIMARY KEY,
        handle TEXT NOT NULL DEFAULT '',
        nome TEXT NOT NULL DEFAULT '',
        credito TEXT NOT NULL DEFAULT '',
        youtube_channel_id TEXT NOT NULL DEFAULT '',
        paleta_primaria TEXT NOT NULL DEFAULT '',
        paleta_secundaria TEXT NOT NULL DEFAULT '',
        paleta_acento TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS mascote_identity (
        channel_id TEXT PRIMARY KEY,
        nome TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS channel_theme (
        channel_id TEXT PRIMARY KEY,
        tema_id TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS editorial_skill (
        channel_id TEXT NOT NULL,
        skill_key TEXT NOT NULL,
        corpo TEXT NOT NULL DEFAULT '',
        params_json TEXT NOT NULL DEFAULT '{}',
        lentes_json TEXT NOT NULL DEFAULT '[]',
        scaffold TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (channel_id, skill_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS editorial_skill_version (
        channel_id TEXT NOT NULL,
        skill_key TEXT NOT NULL,
        versao INTEGER NOT NULL,
        corpo TEXT NOT NULL DEFAULT '',
        params_json TEXT NOT NULL DEFAULT '{}',
        lentes_json TEXT NOT NULL DEFAULT '[]',
        scaffold TEXT NOT NULL DEFAULT '',
        vigente INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (channel_id, skill_key, versao)
    )
    """,
)

# Colunas adicionadas depois da criação original de uma tabela: (tabela, coluna,
# DDL de ADD COLUMN). Aplicadas por `_migrar_colunas` em bancos que já existiam
# antes da coluna existir (o `CREATE TABLE IF NOT EXISTS` sozinho não as adiciona).
_MIGRACOES_COLUNA = (
    # D-297: scaffold (contrato de saída) por (canal, skill) — emenda do E-021.
    (
        "editorial_skill",
        "scaffold",
        "ALTER TABLE editorial_skill ADD COLUMN scaffold TEXT NOT NULL DEFAULT ''",
    ),
)


def _migrar_colunas(conn: sqlite3.Connection) -> None:
    """Adiciona colunas novas a tabelas pré-existentes (idempotente).

    Um banco criado antes de uma coluna nova não a ganha pelo `CREATE TABLE IF
    NOT EXISTS`; este passo checa `PRAGMA table_info` e só roda o `ALTER` quando
    a coluna falta — seguro rodar a cada abertura.
    """
    for tabela, coluna, ddl in _MIGRACOES_COLUNA:
        colunas = {row["name"] for row in conn.execute(f"PRAGMA table_info({tabela})")}
        if coluna not in colunas:
            conn.execute(ddl)


def _backfill_versao_inicial(conn: sqlite3.Connection) -> None:
    """Semeia a versão 1 vigente de cada `editorial_skill` que ainda não tem
    histórico (D-312). Idempotente: só toca linhas sem NENHUMA versão, então
    reabrir o banco é no-op. É como cada canal já em produção — cujas skills foram
    gravadas antes desta feature — ganha a versão inicial sem perder o corpo v2 já
    persistido (D-311). Um único INSERT..SELECT, barato o bastante para o boot.

    `criado_em` reaproveita o `updated_at` da linha (melhor timestamp disponível);
    se vazio, cai no agora.
    """
    conn.execute(
        "INSERT INTO editorial_skill_version "
        "(channel_id, skill_key, versao, corpo, params_json, lentes_json, scaffold, vigente, criado_em) "
        "SELECT s.channel_id, s.skill_key, 1, s.corpo, s.params_json, s.lentes_json, s.scaffold, 1, "
        "CASE WHEN s.updated_at <> '' THEN s.updated_at ELSE ? END "
        "FROM editorial_skill s "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM editorial_skill_version v "
        "  WHERE v.channel_id = s.channel_id AND v.skill_key = s.skill_key"
        ")",
        (datetime.now(UTC).isoformat(),),
    )


def _connect(db_path: Path) -> sqlite3.Connection:
    """Abre o banco de settings garantindo o schema (idempotente) e WAL.

    Cria o arquivo/diretório se preciso; roda o DDL `IF NOT EXISTS` a cada abertura
    para que um banco novo (primeiro boot, split PROD/DEV) já nasça com as tabelas.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    for ddl in _DDL:
        conn.execute(ddl)
    _migrar_colunas(conn)
    _backfill_versao_inicial(conn)
    conn.commit()
    return conn


def inicializar(db_path: Path) -> None:
    """Garante o arquivo do banco e as tabelas de settings. No-op se já existem."""
    _connect(db_path).close()


# --------------------------------------------------------------------------- #
# App settings (bloco por canal — espelha app_settings.json)
# --------------------------------------------------------------------------- #


def ler_app_settings(db_path: Path, channel_id: str) -> dict | None:
    """Lê a linha de app settings do canal, ou `None` se ainda não existe.

    `None` sinaliza ao chamador para cair no arquivo legado (fallback/migração):
    ver `AppSettingsService`.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM app_settings WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _APP_COLUNAS}


def gravar_app_settings(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a linha de app settings do canal.

    `valores` deve conter todas as chaves de `_APP_COLUNAS`. Escrita idempotente:
    reescrever a mesma linha é seguro.
    """
    colunas = ("channel_id", *_APP_COLUNAS)
    placeholders = ", ".join("?" for _ in colunas)
    atribuicoes = ", ".join(f"{c}=excluded.{c}" for c in _APP_COLUNAS)
    parametros = (channel_id, *(valores[c] for c in _APP_COLUNAS))
    conn = _connect(db_path)
    try:
        conn.execute(
            f"INSERT INTO app_settings ({', '.join(colunas)}) VALUES ({placeholders}) "
            f"ON CONFLICT(channel_id) DO UPDATE SET {atribuicoes}",
            parametros,
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Identidade do canal (espelha channel.yaml)
# --------------------------------------------------------------------------- #


def ler_identidade(db_path: Path, channel_id: str) -> dict | None:
    """Lê a linha de identidade do canal, ou `None` se ainda não existe."""
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM channel_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _IDENTIDADE_COLUNAS}


def gravar_identidade(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a identidade do canal a partir dos campos presentes.

    Faz merge: só as colunas presentes em `valores` são alteradas; as demais são
    preservadas (ou nascem com o default do schema numa linha nova). Espelha a
    semântica de merge raso de `channels._aplicar_identidade`.
    """
    presentes = [c for c in _IDENTIDADE_COLUNAS if c in valores]
    conn = _connect(db_path)
    try:
        existe = conn.execute(
            "SELECT 1 FROM channel_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
        if existe is None:
            conn.execute("INSERT INTO channel_identity (channel_id) VALUES (?)", (channel_id,))
        if presentes:
            sets = ", ".join(f"{c}=?" for c in presentes)
            conn.execute(
                f"UPDATE channel_identity SET {sets} WHERE channel_id = ?",
                (*(str(valores[c]) for c in presentes), channel_id),
            )
        conn.commit()
    finally:
        conn.close()


def listar_identidades(db_path: Path) -> dict[str, dict]:
    """Todas as identidades do banco, indexadas por `channel_id`.

    Usado pela listagem de canais para compor a identidade sem abrir o banco de
    cada canal. Canais sem linha (ainda não migrados) não aparecem aqui — o
    chamador completa pelo `channel.yaml`.
    """
    conn = _connect(db_path)
    try:
        linhas = conn.execute("SELECT * FROM channel_identity").fetchall()
    finally:
        conn.close()
    return {
        row["channel_id"]: {coluna: row[coluna] for coluna in _IDENTIDADE_COLUNAS} for row in linhas
    }


# --------------------------------------------------------------------------- #
# Identidade do mascote (D-285 — espelha editorial/mascote.yaml)
# --------------------------------------------------------------------------- #


def ler_mascote(db_path: Path, channel_id: str) -> dict | None:
    """Lê a identidade do mascote do canal, ou `None` se ainda não existe.

    `None` sinaliza ao chamador para cair no arquivo legado (`mascote.yaml`) e
    semear o banco — ver `editorial_identity.identidade_do_mascote`.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM mascote_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _MASCOTE_COLUNAS}


def gravar_mascote(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a identidade do mascote do canal.

    `valores` deve conter a chave `nome`. Escrita idempotente: reescrever a mesma
    linha é seguro (semeadura no primeiro acesso, edição pela UI).
    """
    colunas = ("channel_id", *_MASCOTE_COLUNAS)
    placeholders = ", ".join("?" for _ in colunas)
    atribuicoes = ", ".join(f"{c}=excluded.{c}" for c in _MASCOTE_COLUNAS)
    parametros = (channel_id, *(str(valores[c]) for c in _MASCOTE_COLUNAS))
    conn = _connect(db_path)
    try:
        conn.execute(
            f"INSERT INTO mascote_identity ({', '.join(colunas)}) VALUES ({placeholders}) "
            f"ON CONFLICT(channel_id) DO UPDATE SET {atribuicoes}",
            parametros,
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Tema de render selecionado por canal (D-174)
# --------------------------------------------------------------------------- #


def ler_tema(db_path: Path, channel_id: str) -> str | None:
    """Id do tema selecionado pelo canal, ou `None` se o canal nunca escolheu.

    `None` (linha ausente) sinaliza "sem seleção" — o chamador cai no comportamento
    legado (materialização do asset do canal / default versionado), preservando o
    render atual. Uma linha com `tema_id=''` é tratada igual a ausente pelo serviço.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT tema_id FROM channel_theme WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return row["tema_id"] or None


def gravar_tema(db_path: Path, channel_id: str, tema_id: str) -> None:
    """Grava (UPSERT) o tema selecionado do canal. Escrita idempotente."""
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO channel_theme (channel_id, tema_id) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET tema_id = excluded.tema_id",
            (channel_id, str(tema_id)),
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Skills editoriais por canal (E-021)
# --------------------------------------------------------------------------- #


def ler_skill(db_path: Path, channel_id: str, skill_key: str) -> dict | None:
    """Lê a linha de uma skill editorial do canal, ou `None` se ainda não existe.

    `None` sinaliza ao chamador (serviço `editorial_skills`) para migrar/semear a
    partir do `.md` legado + defaults de código — mesmo contrato de `ler_mascote`.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM editorial_skill WHERE channel_id = ? AND skill_key = ?",
            (channel_id, skill_key),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _SKILL_COLUNAS}


def ler_skills_do_canal(db_path: Path, channel_id: str) -> dict[str, dict]:
    """Todas as skills gravadas para o canal, indexadas por `skill_key`.

    Skills ainda não migradas não aparecem — o chamador completa com os defaults.
    """
    conn = _connect(db_path)
    try:
        linhas = conn.execute(
            "SELECT * FROM editorial_skill WHERE channel_id = ?", (channel_id,)
        ).fetchall()
    finally:
        conn.close()
    return {row["skill_key"]: {coluna: row[coluna] for coluna in _SKILL_COLUNAS} for row in linhas}


def _snapshot_versao(conn: sqlite3.Connection, channel_id: str, skill_key: str) -> None:
    """Cria uma nova versão VIGENTE a partir do estado ATUAL da `editorial_skill`,
    desmarcando a anterior (D-312) — dentro da transação do chamador.

    Append-only: nunca reativa uma versão antiga; a vigência move-se sempre para a
    versão mais nova. Lê o conteúdo de volta da linha materializada, então basta
    chamar DEPOIS de gravar a `editorial_skill` — vale para o corpo/params/lentes
    (`gravar_skill`) e para o scaffold (`gravar_scaffold`), sem duplicar o conteúdo.

    Dedup: se o conteúdo já é idêntico à versão vigente (um "salvar" sem alteração
    real, um reset que reafirma o valor), não cria versão — evita inflar o histórico
    com snapshots iguais. Sem linha materializada ainda → no-op.
    """
    atual = conn.execute(
        "SELECT corpo, params_json, lentes_json, scaffold FROM editorial_skill "
        "WHERE channel_id = ? AND skill_key = ?",
        (channel_id, skill_key),
    ).fetchone()
    if atual is None:
        return
    vigente = conn.execute(
        "SELECT * FROM editorial_skill_version "
        "WHERE channel_id = ? AND skill_key = ? AND vigente = 1",
        (channel_id, skill_key),
    ).fetchone()
    if vigente is not None and all(vigente[c] == atual[c] for c in _VERSAO_CONTEUDO):
        return
    conn.execute(
        "UPDATE editorial_skill_version SET vigente = 0 "
        "WHERE channel_id = ? AND skill_key = ? AND vigente = 1",
        (channel_id, skill_key),
    )
    proxima = conn.execute(
        "SELECT COALESCE(MAX(versao), 0) + 1 AS n FROM editorial_skill_version "
        "WHERE channel_id = ? AND skill_key = ?",
        (channel_id, skill_key),
    ).fetchone()["n"]
    conn.execute(
        "INSERT INTO editorial_skill_version "
        "(channel_id, skill_key, versao, corpo, params_json, lentes_json, scaffold, vigente, criado_em) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
        (
            channel_id,
            skill_key,
            proxima,
            atual["corpo"],
            atual["params_json"],
            atual["lentes_json"],
            atual["scaffold"],
            datetime.now(UTC).isoformat(),
        ),
    )


def gravar_skill(db_path: Path, channel_id: str, skill_key: str, valores: dict) -> None:
    """Grava a linha de uma skill editorial do canal e VERSIONA a mudança (D-312).

    `valores` deve conter `corpo`, `params_json` e `lentes_json`; `updated_at` é
    carimbado aqui (ISO-8601 UTC) para o store ser a fonte única do timestamp.
    Escrita idempotente: reescrever a mesma skill é seguro (seed no 1º acesso,
    edição/reset pela UI).

    A `editorial_skill` continua sendo a LINHA VIGENTE que `ler_skill` lê
    (comportamento externo inalterado); a mesma transação insere uma nova versão
    vigente no histórico e desmarca a anterior (`_snapshot_versao`, com dedup).
    """
    dados = {
        "corpo": str(valores["corpo"]),
        "params_json": str(valores["params_json"]),
        "lentes_json": str(valores["lentes_json"]),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    colunas = ("channel_id", "skill_key", *_SKILL_COLUNAS)
    placeholders = ", ".join("?" for _ in colunas)
    atribuicoes = ", ".join(f"{c}=excluded.{c}" for c in _SKILL_COLUNAS)
    parametros = (channel_id, skill_key, *(dados[c] for c in _SKILL_COLUNAS))
    conn = _connect(db_path)
    try:
        conn.execute(
            f"INSERT INTO editorial_skill ({', '.join(colunas)}) VALUES ({placeholders}) "
            f"ON CONFLICT(channel_id, skill_key) DO UPDATE SET {atribuicoes}",
            parametros,
        )
        _snapshot_versao(conn, channel_id, skill_key)
        conn.commit()
    finally:
        conn.close()


def deletar_skill(db_path: Path, channel_id: str, skill_key: str) -> None:
    """Remove a linha de uma skill do canal (reset total → volta ao default/seed).

    No-op se a linha não existir. O chamador re-semeia na próxima leitura.
    """
    conn = _connect(db_path)
    try:
        conn.execute(
            "DELETE FROM editorial_skill WHERE channel_id = ? AND skill_key = ?",
            (channel_id, skill_key),
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Scaffolds (contrato de saída) por canal (D-297) — coluna da tabela editorial_skill
# --------------------------------------------------------------------------- #


def ler_scaffold(db_path: Path, channel_id: str, skill_key: str) -> str | None:
    """Lê o scaffold gravado na linha da skill, ou `None` se a linha não existe.

    Diferencia dois estados para o chamador (serviço `editorial_scaffolds`):
    `None` (linha ausente) e `""` (linha existe, scaffold ainda não semeado) —
    ambos disparam o seed a partir do default versionado.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT scaffold FROM editorial_skill WHERE channel_id = ? AND skill_key = ?",
            (channel_id, skill_key),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return row["scaffold"]


def gravar_scaffold(db_path: Path, channel_id: str, skill_key: str, scaffold: str) -> None:
    """Grava (UPSERT) apenas a coluna `scaffold` da linha da skill.

    O UPSERT toca só `scaffold`/`updated_at`: corpo/params/lentes (E-021) ficam
    intactos quando a linha já existe. O chamador garante que a linha da skill já
    foi semeada (via `editorial_skills.resolver_skill`) antes de gravar o scaffold,
    para nunca criar uma linha com corpo vazio que faria o E-021 pular o seed.
    """
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO editorial_skill (channel_id, skill_key, scaffold, updated_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(channel_id, skill_key) DO UPDATE SET "
            "scaffold = excluded.scaffold, updated_at = excluded.updated_at",
            (channel_id, skill_key, str(scaffold), datetime.now(UTC).isoformat()),
        )
        # D-312: o scaffold é campo de conteúdo versionado — editá-lo também gera
        # uma nova versão (mesma disciplina append-only do corpo/params/lentes).
        _snapshot_versao(conn, channel_id, skill_key)
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Histórico de versões das skills (D-312) — append-only, reverter e auditar
# --------------------------------------------------------------------------- #


def listar_versoes_skill(db_path: Path, channel_id: str, skill_key: str) -> list[dict]:
    """Todas as versões de uma skill do canal, da mais nova para a mais antiga.

    Cada item traz o snapshot completo do registro naquele momento (conteúdo +
    `versao`/`vigente`/`criado_em`), matéria-prima para a UI montar o histórico
    (data + o que mudou) e para o serviço computar o diff entre versões.
    """
    conn = _connect(db_path)
    try:
        linhas = conn.execute(
            "SELECT * FROM editorial_skill_version "
            "WHERE channel_id = ? AND skill_key = ? ORDER BY versao DESC",
            (channel_id, skill_key),
        ).fetchall()
    finally:
        conn.close()
    return [{coluna: row[coluna] for coluna in _VERSAO_COLUNAS} for row in linhas]


def reverter_skill_para_versao(db_path: Path, channel_id: str, skill_key: str, versao: int) -> dict:
    """Reverte a skill ao conteúdo de `versao`, mantendo o histórico append-only.

    Em vez de reativar a versão antiga, materializa o conteúdo dela na
    `editorial_skill` e cria uma NOVA versão vigente com esse conteúdo (via
    `_snapshot_versao`) — assim reverter é auditável como qualquer outra edição e
    a numeração nunca retrocede. Levanta `KeyError` se a versão não existe; se o
    conteúdo alvo já é o vigente, o dedup do snapshot torna a reversão um no-op no
    histórico (a linha materializada é reafirmada, sem versão nova). Devolve o
    conteúdo revertido (para o serviço espelhar o corpo no `.md`).
    """
    conn = _connect(db_path)
    try:
        alvo = conn.execute(
            "SELECT corpo, params_json, lentes_json, scaffold FROM editorial_skill_version "
            "WHERE channel_id = ? AND skill_key = ? AND versao = ?",
            (channel_id, skill_key, versao),
        ).fetchone()
        if alvo is None:
            raise KeyError(
                f"Versão {versao} inexistente para a skill {skill_key!r} do canal {channel_id!r}."
            )
        conn.execute(
            "INSERT INTO editorial_skill "
            "(channel_id, skill_key, corpo, params_json, lentes_json, scaffold, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(channel_id, skill_key) DO UPDATE SET "
            "corpo = excluded.corpo, params_json = excluded.params_json, "
            "lentes_json = excluded.lentes_json, scaffold = excluded.scaffold, "
            "updated_at = excluded.updated_at",
            (
                channel_id,
                skill_key,
                alvo["corpo"],
                alvo["params_json"],
                alvo["lentes_json"],
                alvo["scaffold"],
                datetime.now(UTC).isoformat(),
            ),
        )
        _snapshot_versao(conn, channel_id, skill_key)
        conn.commit()
    finally:
        conn.close()
    return {coluna: alvo[coluna] for coluna in _VERSAO_CONTEUDO}

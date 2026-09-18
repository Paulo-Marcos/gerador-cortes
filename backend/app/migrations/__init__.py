"""Evolução de schema do SQLite no boot: reconciliação declarativa + migrations.

O ``.db`` do usuário é gitignored: num ``git pull`` de uma versão nova, o banco
precisa ser MIGRADO no boot, não recriado. Este módulo aplica migrations
idempotentes em ordem crescente de versão e carimba ``PRAGMA user_version`` a
cada passo. Migrations já aplicadas (``version <= user_version``) NÃO
reexecutam — rerodar o boot é seguro.

Antes das migrations versionadas roda a reconciliação declarativa
(:mod:`app.migrations.reconciliacao`), que deriva de ``Base.metadata`` as colunas
que o modelo declara e o banco não tem. Ela é a rede de segurança para a coluna
que entrou no modelo sem migration nem ALTER — cenário que quebrava a API com
``no such column`` (D-403). Roda em TODO boot, não uma vez só: a
``user_version`` marca a evolução intencional, não o estado real do arquivo.

Escolha de ``PRAGMA user_version`` (em vez de tabela ``schema_version``):
é um inteiro no cabeçalho do próprio arquivo, sem custo de tabela extra,
atômico e já existente em qualquer banco SQLite (inicia em ``0``). É a opção
mais simples e robusta para um banco local de aplicação pessoal.

Para registrar uma migration futura: crie ``migration_NNN_<slug>.py`` com uma
coroutine ``upgrade(conn)`` que faça o DDL de evolução, importe-a aqui e
acrescente uma entrada à tupla ``MIGRATIONS`` com a próxima ``version``.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from app.migrations import (
    migration_001_baseline,
    migration_002_paths_relativos,
    migration_003_paths_video_short,
    migration_004_campos_v2_cortes,
    migration_005_trechos_geracoes,
    migration_006_indices_filtros_quentes,
    reconciliacao,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True)
class Migration:
    """Uma migration de schema: a versão que ela carimba e o DDL que aplica."""

    version: int
    description: str
    upgrade: Callable[[AsyncConnection], Awaitable[None]]


# Migrations em ordem crescente de versão. A baseline (001) apenas carimba o
# schema existente — toda evolução real de schema entra como versão >= 2.
MIGRATIONS: tuple[Migration, ...] = (
    Migration(
        version=1,
        description="baseline — carimba o schema existente sem alterar dados",
        upgrade=migration_001_baseline.upgrade,
    ),
    Migration(
        version=2,
        description="D-158 — caminhos de artefato relativos ao projeto",
        upgrade=migration_002_paths_relativos.upgrade,
    ),
    Migration(
        version=3,
        description="D-172 — arquivo_video_path e arquivo_short_path relativos ao projeto",
        upgrade=migration_003_paths_video_short.upgrade,
    ),
    Migration(
        version=4,
        description="D-302 — campos v2 (frase_gancho, contextualizacao, score) em cortes/snapshots",
        upgrade=migration_004_campos_v2_cortes.upgrade,
    ),
    Migration(
        version=5,
        description="D-334 — trechos_geracoes/trechos_geracoes_log em cortes",
        upgrade=migration_005_trechos_geracoes.upgrade,
    ),
    Migration(
        version=6,
        description="D-650 — índices em cortes.projeto_id, shorts.corte_id e projetos.youtube_url",
        upgrade=migration_006_indices_filtros_quentes.upgrade,
    ),
)


async def _ler_versao_schema(conn: AsyncConnection) -> int:
    """Lê a versão de schema gravada no cabeçalho do banco (``0`` se nunca migrado)."""
    resultado = await conn.execute(text("PRAGMA user_version"))
    return int(resultado.scalar_one())


async def _carimbar_versao_schema(conn: AsyncConnection, versao: int) -> None:
    """Grava a versão de schema. ``PRAGMA`` não aceita bind param; ``versao`` é
    inteiro controlado internamente (nunca vem de entrada externa)."""
    await conn.execute(text(f"PRAGMA user_version = {int(versao)}"))


async def aplicar_migrations(conn: AsyncConnection) -> int:
    """Reconcilia o schema declarativo, aplica as migrations pendentes em ordem
    e retorna a versão final do schema.

    Idempotente nas duas etapas: a reconciliação só age sobre coluna do modelo
    ausente no banco, e as migrations pulam tudo que já está abaixo ou na
    ``user_version`` atual.
    """
    await reconciliacao.reconciliar_schema(conn)

    versao_atual = await _ler_versao_schema(conn)
    for migration in MIGRATIONS:
        if migration.version <= versao_atual:
            continue
        await migration.upgrade(conn)
        await _carimbar_versao_schema(conn, migration.version)
        versao_atual = migration.version
    return versao_atual

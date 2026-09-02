"""Confere se o que ESTÁ RODANDO é o que está no disco (D-491).

Quatro vezes numa sessão só, um bug foi caçado onde ele não estava:

  1. o dropdown da fábrica não aparecia — o backend no ar era anterior ao código;
  2. a tela de shorts quebrava — faltava `npm install` de uma dependência nova,
     e nada dizia isso;
  3. uma coluna "não existia" — ela nasce no boot, e ninguém tinha reiniciado;
  4. eu presumi que o PROD estava atrasado quando não estava.

O padrão é sempre o mesmo: o código certo existe, mas não é o que está no ar. O
sintoma aparece na feature; a causa está no processo. E o operador não tem como
ver a diferença — ela é invisível por natureza.

Este módulo torna a diferença visível. Não conserta nada: diz o que está
dessincronizado, para que a próxima hora seja gasta no lugar certo.
"""

from __future__ import annotations

import json
import logging
import subprocess
from functools import lru_cache
from pathlib import Path

from app.migrations.reconciliacao import colunas_faltantes
from app.models import Base
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

_RAIZ = Path(__file__).resolve().parents[3]
_TIMEOUT_GIT_SEG = 5


@lru_cache(maxsize=1)
def commit_do_processo() -> str:
    """O commit que este processo carregou.

    `lru_cache` NÃO é otimização aqui: é o mecanismo. A primeira chamada
    acontece no boot e congela o valor; o disco pode andar depois, e é
    justamente essa diferença que revela um backend velho no ar.
    """
    return _commit_do_disco()


def _commit_do_disco() -> str:
    """O commit que está no checkout AGORA."""
    try:
        saida = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=_RAIZ,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_GIT_SEG,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return saida.stdout.strip() if saida.returncode == 0 else ""


async def colunas_pendentes(conn: AsyncConnection) -> list[str]:
    """`tabela.coluna` que o modelo declara e o banco não tem.

    Reusa `colunas_faltantes` da reconciliação (D-403) — a mesma conta que
    decide o que criar no boot decide o que está faltando agora. Duas versões
    discordariam, e a que mente é sempre a que o operador está lendo.
    """
    pendentes: list[str] = []
    for tabela, modelo in Base.metadata.tables.items():
        try:
            resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
        except Exception:  # noqa: BLE001 — tabela ausente nao e erro deste check
            continue
        atuais = {linha[1] for linha in resultado.fetchall()}
        if not atuais:
            continue
        pendentes.extend(
            f"{tabela}.{coluna}" for coluna in colunas_faltantes(modelo.columns.keys(), atuais)
        )
    return sorted(pendentes)


def dependencias_faltando() -> list[str]:
    """Pacotes que o `package.json` declara e o `node_modules` não tem.

    Foi este o caso do `@remotion/captions`: o código o importava, o
    package.json o declarava, e a tela quebrava com um erro de módulo que não
    dizia "rode npm install".

    Só as dependências de produção: `devDependencies` faltando não derruba a
    tela do operador, e listá-las viraria ruído num aviso que precisa ser lido.
    """
    manifesto = _RAIZ / "frontend" / "package.json"
    node_modules = _RAIZ / "frontend" / "node_modules"
    if not manifesto.is_file() or not node_modules.is_dir():
        return []

    try:
        declaradas = json.loads(manifesto.read_text(encoding="utf-8")).get("dependencies", {})
    except (OSError, json.JSONDecodeError):
        return []

    return sorted(nome for nome in declaradas if not (node_modules / nome).exists())


async def estado(conn: AsyncConnection) -> dict:
    """O retrato completo, com um veredito pronto para a tela.

    `em_dia` é calculado aqui, e não no frontend, para que a resposta de "está
    sincronizado?" seja uma só. Uma tela que monta o próprio veredito passa a
    poder discordar de outra.
    """
    rodando = commit_do_processo()
    disco = _commit_do_disco()
    pendentes = await colunas_pendentes(conn)
    faltando = dependencias_faltando()

    # Commit vazio (git indisponível, checkout exportado) não vira alarme: não
    # saber não é o mesmo que estar errado, e um aviso falso ensina a ignorar
    # o aviso verdadeiro.
    backend_velho = bool(rodando) and bool(disco) and rodando != disco

    return {
        "commit_rodando": rodando,
        "commit_disco": disco,
        "backend_velho": backend_velho,
        "colunas_pendentes": pendentes,
        "dependencias_faltando": faltando,
        "em_dia": not backend_velho and not pendentes and not faltando,
    }

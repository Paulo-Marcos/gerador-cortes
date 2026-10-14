"""As novidades do app, em português, e o que o operador ainda não viu (D-922).

Fonte: o `CHANGELOG.md` e os fragmentos de `changelog.d/` da pasta onde o app
roda — a PROD mostra exatamente o que puxou. A tradução é feita pela IA da
assinatura (Claude CLI) sob demanda, por versão, e guardada: cada entrada é
traduzida uma vez.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core import channel_paths
from app.domain.compartilhado.erros import NaoEncontrado, ServicoExternoFalhou
from app.domain.novidades import traducao
from app.domain.novidades.changelog import (
    SEM_VERSAO,
    Entrada,
    Versao,
    juntar,
    ler_changelog,
    ler_fragmentos,
)
from app.infrastructure import claude_cli_client, novidades_store


@dataclass(frozen=True)
class Novidade:
    entrada: Entrada
    traducao: dict[str, str] | None
    nova: bool


@dataclass(frozen=True)
class VersaoComNovidades:
    versao: str
    data: str | None
    novidades: list[Novidade]


def ler_versoes() -> list[Versao]:
    texto, fragmentos = novidades_store.ler_arquivos_do_changelog(channel_paths.repo_root())
    return juntar(ler_changelog(texto), ler_fragmentos(fragmentos))


def _vistas(versoes: list[Versao]) -> set[str]:
    """O que o operador já viu. Na primeira vez, tudo o que já tem versão.

    Sem isto, a primeira visita marcaria como "novo" o histórico inteiro, e o
    selo que deveria apontar o que mudou não apontaria nada.
    """
    db = channel_paths.settings_db_path()
    vistas = novidades_store.ler_vistas(db)
    if vistas:
        return vistas
    antigas = [e.chave for v in versoes if v.versao != SEM_VERSAO for e in v.entradas]
    novidades_store.marcar_vistas(db, antigas)
    return set(antigas)


def listar() -> list[VersaoComNovidades]:
    versoes = ler_versoes()
    vistas = _vistas(versoes)
    traducoes = novidades_store.ler_traducoes(channel_paths.settings_db_path())
    return [
        VersaoComNovidades(
            versao=v.versao,
            data=v.data,
            novidades=[
                Novidade(e, traducoes.get(e.chave), e.chave not in vistas) for e in v.entradas
            ],
        )
        for v in versoes
    ]


def contar_novas() -> int:
    return sum(n.nova for v in listar() for n in v.novidades)


def marcar_todas_vistas() -> None:
    chaves = [e.chave for v in ler_versoes() for e in v.entradas]
    novidades_store.marcar_vistas(channel_paths.settings_db_path(), chaves)


async def traduzir(versao: str) -> tuple[int, int]:
    """Traduz o próximo lote da versão. Devolve (traduzidas agora, ainda pendentes)."""
    alvo = next((v for v in ler_versoes() if v.versao == versao), None)
    if alvo is None:
        raise NaoEncontrado(f"versão {versao!r} não está no CHANGELOG")
    db = channel_paths.settings_db_path()
    feitas = novidades_store.ler_traducoes(db)
    pendentes = [e for e in alvo.entradas if e.chave not in feitas]
    lote = pendentes[: traducao.LOTE]
    if not lote:
        return 0, 0
    try:
        resposta = await claude_cli_client.generate_json(
            traducao.montar_pedido(lote),
            model="sonnet",
            contexto=claude_cli_client.LlmCallContext(etapa="novidades"),
        )
    except (claude_cli_client.ClaudeCliError, ValueError) as erro:
        raise ServicoExternoFalhou(f"a IA não traduziu as novidades: {erro}") from erro
    novas = traducao.ler_resposta(resposta, {e.chave for e in lote})
    novidades_store.gravar_traducoes(db, novas)
    return len(novas), len(pendentes) - len(novas)

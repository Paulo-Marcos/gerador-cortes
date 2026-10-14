"""Que modelo atende cada faixa de IA no canal ativo, e quais existem (D-924).

O código pede uma faixa (`ModelosIa.claude(Faixa.PESADO)`) ou um papel da API do
Gemini (`gemini_api_texto`); quem diz o nome do modelo é esta configuração, que
o operador troca na tela de Canais. As regras moram em
`domain/compartilhado/modelos_ia`; aqui fica o canal ativo e o mundo externo.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core import channel_paths
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.modelos_ia import PADRAO, ModelosIa, completar, so_o_que_difere
from app.infrastructure import antigravity_cli_client, gemini_client, modelos_ia_store


@dataclass(frozen=True)
class Papel:
    """Um papel configurável, como a tela o mostra."""

    key: str
    provedor: str  # "claude" | "gemini" | "gemini_api" — de onde vem a lista
    rotulo: str
    descricao: str


# Ordem = ordem da tela.
PAPEIS: tuple[Papel, ...] = (
    Papel("claude_pesado", "claude", "Pesado", "Propor cortes, trechos e a thumbnail."),
    Papel("claude_medio", "claude", "Médio", "Metadados, cenas, avaliação e shorts."),
    Papel("claude_rapido", "claude", "Rápido", "Etiquetas curtas e o sentimento do ranking."),
    Papel("gemini_pesado", "gemini", "Pesado", "As mesmas etapas, pelo botão Gemini."),
    Papel("gemini_medio", "gemini", "Médio", "As mesmas etapas, pelo botão Gemini."),
    Papel("gemini_rapido", "gemini", "Rápido", "As mesmas etapas, pelo botão Gemini."),
    Papel("gemini_api_texto", "gemini_api", "Texto", "Cenas e desvios pela chave da API."),
    Papel("gemini_api_imagem", "gemini_api", "Imagem", "A imagem da thumbnail."),
)

# O `claude` não tem comando que liste modelos: o catálogo é nosso. Os aliases
# acompanham sozinhos o modelo mais novo da família; os ids fixam uma versão.
MODELOS_CLAUDE: tuple[tuple[str, str], ...] = (
    ("opus", "Opus (sempre o mais novo)"),
    ("sonnet", "Sonnet (sempre o mais novo)"),
    ("haiku", "Haiku (sempre o mais novo)"),
    ("claude-fable-5-1", "Claude Fable 5.1"),
    ("claude-opus-5-5", "Claude Opus 5.5"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5"),
    ("claude-haiku-5-5", "Claude Haiku 5.5"),
)


@dataclass(frozen=True)
class PapelDescrito:
    papel: Papel
    valor: str
    padrao: str


def _db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else channel_paths.active_channel_root().name
    return db, cid


def ler_modelos(*, db_path: Path | None = None, channel_id: str | None = None) -> ModelosIa:
    """Os modelos vigentes do canal ativo, completos com o padrão."""
    return completar(modelos_ia_store.ler(*_db_e_canal(db_path, channel_id)))


def descrever_modelos(
    *, db_path: Path | None = None, channel_id: str | None = None
) -> list[PapelDescrito]:
    escolhas = ler_modelos(db_path=db_path, channel_id=channel_id).escolhas
    return [PapelDescrito(p, escolhas[p.key], PADRAO[p.key]) for p in PAPEIS]


def definir_modelos(
    escolhas: dict[str, str], *, db_path: Path | None = None, channel_id: str | None = None
) -> list[PapelDescrito]:
    """Grava as escolhas (merge sobre as atuais). Valor vazio volta ao padrão."""
    desconhecidos = sorted(set(escolhas) - set(PADRAO))
    if desconhecidos:
        raise PedidoInvalido(f"papel de modelo desconhecido: {', '.join(desconhecidos)}")
    db, cid = _db_e_canal(db_path, channel_id)
    atuais = {**modelos_ia_store.ler(db, cid), **escolhas}
    modelos_ia_store.gravar(db, cid, so_o_que_difere(atuais))
    return descrever_modelos(db_path=db, channel_id=cid)


def listar_disponiveis() -> dict[str, list[tuple[str, str]]]:
    """Os modelos que cada provedor oferece nesta máquina, como (id, nome).

    O Antigravity também roda Claude e GPT; a lista do botão Gemini fica só com o
    Gemini. Lista vazia quando o CLI ou a chave faltam — a tela mostra o atual.
    """
    return {
        "claude": list(MODELOS_CLAUDE),
        "gemini": [m for m in antigravity_cli_client.listar_modelos() if m[0].startswith("gemini")],
        "gemini_api": gemini_client.listar_modelos(),
    }

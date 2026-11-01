"""D-1006: a lista de motivos de excluir um corte, editável por canal.

Até a D-1005 o vocabulário era fixo no código (`motivo_apagado.MOTIVOS_APAGADO`).
O operador quer acrescentar um motivo, que passa a aparecer como chip dali para
frente, e tirar um que nunca vai usar. Duas regras seguram o histórico:

- o slug nasce do nome uma vez e não muda mais: é ele que fica gravado no
  snapshot de cada corte apagado;
- tirar um motivo só o ESCONDE dos chips. Ele continua na lista, com o nome
  que tinha, e a telemetria segue contando os cortes que saíram por ele.

Cada motivo é um dict `{"slug", "rotulo", "ativo"}`. Puro: o service grava.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.corte.motivo_apagado import MOTIVOS_APAGADO, SEM_MOTIVO

TAMANHO_MAX_ROTULO = 40


class MotivoDeExclusaoInvalido(PedidoInvalido):
    """Nome vazio, longo demais ou repetido."""


class MotivoDeExclusaoInexistente(NaoEncontrado):
    """O slug não é de nenhum motivo do canal."""


def motivos_padrao() -> list[dict]:
    """A lista de um canal que nunca a editou: os seis da D-993, todos visíveis."""
    return [{**motivo, "ativo": True} for motivo in MOTIVOS_APAGADO]


def ler_motivos(guardados: Iterable[dict] | None) -> list[dict]:
    """A lista gravada, em forma; None (nunca editada) é o padrão.

    Entrada sem slug ou rótulo sai, em vez de derrubar a tela do canal.
    """
    if guardados is None:
        return motivos_padrao()
    return [
        {"slug": str(m["slug"]), "rotulo": str(m["rotulo"]), "ativo": bool(m.get("ativo", True))}
        for m in guardados
        if isinstance(m, dict) and m.get("slug") and m.get("rotulo")
    ]


def slugs_visiveis(motivos: Iterable[dict]) -> list[str]:
    """Os que aparecem como chip — e os únicos que o apagar aceita."""
    return [m["slug"] for m in motivos if m["ativo"]]


def slugs_de_todos(motivos: Iterable[dict]) -> list[str]:
    """Visíveis e escondidos: o que a telemetria conta."""
    return [m["slug"] for m in motivos]


def acrescentar_motivo(motivos: list[dict], rotulo: str) -> list[dict]:
    """A lista com o motivo novo no fim, visível, e o slug tirado do nome."""
    nome = " ".join((rotulo or "").split())
    if not nome:
        raise MotivoDeExclusaoInvalido("Dê um nome ao motivo.")
    if len(nome) > TAMANHO_MAX_ROTULO:
        raise MotivoDeExclusaoInvalido(f"O nome do motivo cabe em {TAMANHO_MAX_ROTULO} caracteres.")
    if any(m["rotulo"].casefold() == nome.casefold() for m in motivos):
        raise MotivoDeExclusaoInvalido(f'Já existe o motivo "{nome}" (talvez escondido).')
    slug = _slug_livre(_slug_do_nome(nome), {m["slug"] for m in motivos})
    return [*motivos, {"slug": slug, "rotulo": nome, "ativo": True}]


def mostrar_motivo(motivos: list[dict], slug: str, *, ativo: bool) -> list[dict]:
    """Esconde (`ativo=False`) ou devolve aos chips um motivo; o resto fica igual."""
    if slug not in slugs_de_todos(motivos):
        raise MotivoDeExclusaoInexistente(f"O motivo {slug!r} não é deste canal.")
    return [{**m, "ativo": ativo} if m["slug"] == slug else m for m in motivos]


def _slug_do_nome(nome: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "_", sem_acento.lower()).strip("_")
    if not slug:
        raise MotivoDeExclusaoInvalido("O nome do motivo precisa de ao menos uma letra ou número.")
    return slug


def _slug_livre(slug: str, ocupados: set[str]) -> str:
    """O slug, ou com sufixo se já é de outro motivo (mesmo escondido) ou da ausência."""
    ocupados = ocupados | {SEM_MOTIVO}
    candidato, n = slug, 2
    while candidato in ocupados:
        candidato, n = f"{slug}_{n}", n + 1
    return candidato

"""A Mascote do Canal: o personagem que os prompts citam pelo nome (D-762).

O objeto e as regras moravam em `services/canal/editorial_identity.py`, junto
com o banco de settings e o espelho `editorial/mascote.yaml`. Lá ficou onde a
mascote é guardada; aqui, o que ela é: um nome, e o que vale quando não há nome.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Mascote:
    """Identidade editorial da mascote usada nos prompts.

    `nome` entra VERBATIM no texto dos prompts (ex.: "identidade do Sapo",
    "ombro do Sapo").
    """

    nome: str


# Sem nome definido, os prompts falam de uma "mascote" genérica — nunca do
# personagem de um canal específico. É o padrão seguro de um clone recém-publicado.
MASCOTE_NEUTRO = Mascote(nome="mascote")


def mascote_de(nome: str | None) -> Mascote:
    """A mascote com esse nome, ou a neutra quando o nome é vazio.

    >>> mascote_de("  Sapo ")
    Mascote(nome='Sapo')
    >>> mascote_de("") == MASCOTE_NEUTRO
    True
    """
    nome = str(nome or "").strip()
    return Mascote(nome=nome) if nome else MASCOTE_NEUTRO


def nome_definido(mascote: Mascote) -> str:
    """O nome que o operador definiu, ou "" quando vale a neutra.

    A tela mostra um campo vazio (com placeholder), não o rótulo genérico
    "mascote", que não é um nome escolhido por ninguém.
    """
    return "" if mascote == MASCOTE_NEUTRO else mascote.nome

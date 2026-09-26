"""A identidade do Canal: quem publica os cortes (D-762).

Nome, handle, crédito, paleta e o canal-fonte das lives. Os tipos e as regras
moravam em `services/channels.py`, misturados com o que é da aplicação — o
ponteiro do canal ativo, a cópia do template, a leitura e a escrita do
`channel.yaml` e do banco. Lá ficou o armazenamento; aqui, o que o canal É e as
regras que valem em qualquer lugar onde ele seja guardado.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.compartilhado.erros import PedidoInvalido

# Id de canal = nome de pasta: começa com letra/dígito e usa só [a-z0-9-].
_RE_ID_CANAL = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# Os campos que a identidade aceita numa criação ou edição.
CAMPOS_IDENTIDADE = ("handle", "nome", "credito", "youtube_channel_id")
CAMPOS_PALETA = ("primaria", "secundaria", "acento")


class IdCanalInvalido(PedidoInvalido):
    """O id informado não é um slug de canal válido."""


@dataclass(frozen=True)
class Paleta:
    primaria: str = ""
    secundaria: str = ""
    acento: str = ""


@dataclass(frozen=True)
class Canal:
    """Um canal registrado: o id, a identidade e se é o ativo."""

    id: str
    handle: str
    nome: str
    credito: str
    paleta: Paleta
    ativo: bool
    # Canal-FONTE das lives (handle/id/username do YouTube de onde o ranking baixa).
    youtube_channel_id: str = ""


def id_de_canal_valido(canal_id: str) -> str:
    """O id sem espaços nas pontas, ou `IdCanalInvalido` se não for um slug.

    >>> id_de_canal_valido("  meu-canal ")
    'meu-canal'
    """
    canal_id = (canal_id or "").strip()
    if not _RE_ID_CANAL.match(canal_id):
        raise IdCanalInvalido(
            f"Id de canal inválido: {canal_id!r}. Use apenas letras minúsculas, "
            "dígitos e hífen, começando por letra ou dígito (ex.: 'meu-canal')."
        )
    return canal_id


def mesclar_identidade(atual: dict, mudancas: dict) -> dict:
    """A identidade depois de uma edição: só o que veio muda (merge raso).

    Campo com `None` não mexe; a `paleta` funde campo a campo; chaves que a
    identidade não conhece (ex.: `config_version` do YAML) ficam como estavam.
    Devolve um dicionário novo — `atual` não é tocado.

    >>> mesclar_identidade({"nome": "A", "config_version": 2}, {"nome": "B", "handle": None})
    {'nome': 'B', 'config_version': 2}
    """
    novo = dict(atual)
    for campo in CAMPOS_IDENTIDADE:
        if mudancas.get(campo) is not None:
            novo[campo] = str(mudancas[campo])

    paleta_nova = mudancas.get("paleta")
    if isinstance(paleta_nova, dict):
        paleta = novo.get("paleta")
        paleta = dict(paleta) if isinstance(paleta, dict) else {}
        for campo in CAMPOS_PALETA:
            if paleta_nova.get(campo) is not None:
                paleta[campo] = str(paleta_nova[campo])
        novo["paleta"] = paleta
    return novo

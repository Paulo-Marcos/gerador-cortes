"""Schemas de resposta do lote de publicação (D-564, D-908).

Saíram de `shorts_schemas` quando ele chegou ao teto de tamanho (D-771). O
`response_model` FILTRA: campo omitido aqui seria cortado da resposta.
"""

from app.domain.publicacao.ritmo_publicacao import EstadoItem
from app.routers.resposta_api import RespostaApi


class ItemDoLote(RespostaApi):
    alvo_tipo: str
    alvo_id: str
    plataforma: str
    plataforma_rotulo: str
    rotulo: str
    estado: EstadoItem
    detalhe: str
    url: str
    # D-908: a data marcada para ESTE item, legível ("12/10/2026 as 18:00"), ou vazio.
    agendado_para: str


class RaiaDoLote(RespostaApi):
    plataforma: str
    rotulo: str
    exige_humano: bool
    aviso: str
    itens: list[ItemDoLote]


class LoteDePublicacao(RespostaApi):
    """A publicação em lote, rede a rede (D-617)."""

    lote_id: str
    criado_em: str
    cancelado: bool
    terminou: bool
    tiktok_assistido: bool
    instagram_assistido: bool
    publicar_sozinho: bool
    raias: list[RaiaDoLote]


class LoteAtualResponse(RespostaApi):
    lote: LoteDePublicacao | None


class LoteCanceladoResponse(RespostaApi):
    cancelado: bool
    lote: LoteDePublicacao | None


class LoteConfirmadoResponse(RespostaApi):
    confirmado: bool


class LinhaDaAgenda(RespostaApi):
    """Um item do lote e a data que a janela do canal propõe para ele (D-908)."""

    alvo_tipo: str
    alvo_id: str
    plataforma: str
    # `AAAA-MM-DDTHH:MM` no fuso local, ou vazio quando não há data.
    agendar_para: str
    # Força do público na hora proposta: forte, medio ou fraco; vazio sem data.
    intensidade: str
    # Por que ficou sem data: fora do horizonte, ou destino que publica no ato.
    motivo: str


class AgendaPrevistaResponse(RespostaApi):
    itens: list[LinhaDaAgenda]

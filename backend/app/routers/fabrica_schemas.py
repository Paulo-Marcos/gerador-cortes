"""Schemas da porta da fábrica de shorts: a lista de Fires (D-905).

Saíram de `shorts_schemas.py` quando o cartão ganhou as redes: aquele módulo
estava no teto da catraca de tamanho, e a porta da fábrica é um assunto seu —
o que o cartão da tela de Shorts mostra de cada corte.
"""

from app.routers.resposta_api import RespostaApi


class ContagemDeShorts(RespostaApi):
    """Quantos shorts o corte tem, por estágio da curadoria."""

    total: int
    sugerido: int
    aprovado: int
    rejeitado: int
    renderizado: int


class RedeDoCorte(RespostaApi):
    """Uma rede do short, vista pelo corte inteiro (D-905)."""

    plataforma: str
    publicados: int
    completa: bool


class FireDaFabrica(RespostaApi):
    """Um corte na porta da fábrica: Fire ou indicado à mão (D-502)."""

    corte_id: str
    projeto_id: str
    projeto_titulo: str
    numero: int
    titulo: str
    tema_central: str
    duracao_seg: float
    # D-502: sem bruto o corte AINDA aparece — a tela oferece regerar.
    tem_bruto: bool
    bruto_mb: float
    is_fire: bool
    indicado: bool
    # D-503: há MP4 final para publicar no TikTok?
    tem_video_final: bool
    live_em_disco: bool
    # D-581: a mão humana já passou por aqui? Alimenta "onde eu parei".
    tem_edicao: bool
    # D-593: quando os shorts foram dados por publicados em todas as redes.
    finalizado_em: str | None
    shorts: ContagemDeShorts
    # D-905: as tres redes do short, sempre, na ordem da tela; `completa` acende
    # o icone do cartao quando TODOS os prontos do corte ja subiram nela.
    redes: list[RedeDoCorte]


class FiresResponse(RespostaApi):
    fires: list[FireDaFabrica]

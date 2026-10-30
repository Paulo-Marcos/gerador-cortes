"""Schemas de resposta da Área de Análises (D-722).

A telemetria proposta×final (D-303), as estatísticas do YouTube (D-305) e os
levantamentos respondiam sem schema — o cliente gerado do frontend não tinha o
que tipar. Os modelos descrevem o que os montadores do payload devolvem
(`domain/corte/telemetria_cortes.py`, `services/youtube_stats.py`), inclusive
campos que a tela ainda não lê: o schema diz o que o backend manda, e um campo
omitido aqui seria cortado da resposta.

Onde o serializador repassa a coluna crua do banco, o tipo admite `None`: uma
linha antiga com NULL não pode virar erro 500.
"""

from typing import Any, Literal

from app.domain.corte.telemetria_cortes import (
    SITUACAO_COM_SNAPSHOT,
    SITUACAO_SEM_PROPOSTA_IA,
    SITUACAO_SEM_SNAPSHOT,
)
from app.domain.short.telemetria_shorts import SITUACAO_APAGADO, SITUACAO_VIVO
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais

# ─── Telemetria proposta × final (D-303) ─────────────────────────────────────


class TelemetriaTitulo(RespostaApi):
    proposto: str | None
    final: str
    mudou: bool | None


class TelemetriaBordas(RespostaApi):
    inicio_proposto_seg: float | None
    inicio_final_seg: float
    delta_inicio_seg: float | None
    fim_proposto_seg: float | None
    fim_final_seg: float
    delta_fim_seg: float | None
    duracao_proposta_seg: float | None
    duracao_final_seg: float
    delta_duracao_seg: float | None


class TelemetriaDesvios(RespostaApi):
    """Contagens e as listas de desvios; cada desvio é o dicionário do corte."""

    propostos: int | None
    mantidos: list[dict[str, Any]] | None
    removidos: list[dict[str, Any]] | None
    adicionados: list[dict[str, Any]] | None
    adicionados_por_origem: dict[str, int] | None
    finais: int
    finais_por_origem: dict[str, int]


class TelemetriaAvaliacao(RespostaApi):
    """A avaliação humana do corte (D-419); `voto` None = não avaliado."""

    voto: int | None
    motivos: list[str]
    comentario: str


class TelemetriaCorteDiff(RespostaApi):
    corte_id: str
    numero: int
    situacao: Literal[SITUACAO_COM_SNAPSHOT, SITUACAO_SEM_PROPOSTA_IA, SITUACAO_SEM_SNAPSHOT]
    origem_analise: str | None
    status_final: str
    titulo: TelemetriaTitulo
    bordas: TelemetriaBordas
    desvios: TelemetriaDesvios
    trechos_geracoes: int
    desvios_claude_por_geracao: float
    avaliacao: TelemetriaAvaliacao


class TelemetriaApagados(RespostaApi):
    """D-993: propostas apagadas; `por_motivo` traz todo slug, mais `sem_motivo`."""

    total: int
    por_motivo: dict[str, int]


class TelemetriaShortDiff(RespostaApi):
    """D-995: a proposta congelada de um short contra o short final (None = apagado)."""

    short_id: str
    numero: int
    provedor: str
    modelo: str
    score_proposto: float
    titulo_proposto: str
    gancho_proposto: str
    inicio_proposto_seg: float
    fim_proposto_seg: float
    duracao_proposta_seg: float
    situacao: Literal[SITUACAO_VIVO, SITUACAO_APAGADO]
    status_final: str
    inicio_final_seg: float | None
    fim_final_seg: float | None
    duracao_final_seg: float | None
    delta_inicio_seg: float | None
    delta_fim_seg: float | None
    delta_duracao_seg: float | None
    gancho_mudou: bool | None


class TelemetriaShortsResumo(RespostaApi):
    total: int
    apagados: int
    aceitos: int
    esticados: int
    encurtados: int
    mediana_delta_duracao_aceitos_seg: float | None


class TelemetriaShorts(RespostaApi):
    resumo: TelemetriaShortsResumo
    shorts: list[TelemetriaShortDiff]


class TelemetriaProjetoResponse(RespostaApi):
    projeto_id: str
    titulo_live: str
    total_cortes: int
    com_snapshot: int
    sem_snapshot: int
    cortes: list[TelemetriaCorteDiff]
    apagados: TelemetriaApagados
    shorts: TelemetriaShorts


# ─── Estatísticas do YouTube (D-305) ─────────────────────────────────────────


class YoutubeVideoStat(RespostaApi):
    video_id: str
    canal_id: str | None
    titulo: str | None
    duracao_seg: float | None
    publicado_em: str | None
    views: int | None
    estimated_minutes_watched: float | None
    average_view_duration_seg: float | None
    average_view_percentage: float | None
    subscribers_gained: int | None
    corte_id: str | None
    match_por_titulo: bool
    sincronizado_em: str | None


class YoutubeStatsFalha(RespostaApi):
    """Por que a última sincronização não deu certo (D-994)."""

    mensagem: str
    precisa_reautorizar: bool
    em: str


class YoutubeStatsStatusResponse(RespostaApi):
    total: int
    com_corte: int
    casados_por_titulo: int
    sincronizado_em: str | None
    stale: bool
    dias_desde_sync: int | None
    falha: YoutubeStatsFalha | None
    videos: list[YoutubeVideoStat]


class YoutubeStatsSyncResponse(RespostaComCamposOpcionais):
    """`iniciado` = a sync foi disparada; `erro` = falta autorizar (a tela mostra
    a instrução de `mensagem`)."""

    status: Literal["iniciado", "erro"]
    mensagem: str
    precisa_reautorizar: bool | None = None


class _AgregadoLevantamento(RespostaApi):
    videos: int
    views_total: int
    views_media: float
    retencao_media_pct: float
    retencao_ponderada_pct: float
    avg_view_duration_media_seg: float


class LevantamentoDuracao(_AgregadoLevantamento):
    faixa: str


class LevantamentoTitulo(_AgregadoLevantamento):
    grupo: str
    faixa: str


class LevantamentoDuracaoResponse(RespostaApi):
    faixas: list[LevantamentoDuracao]


class LevantamentoTituloResponse(RespostaApi):
    grupos: list[LevantamentoTitulo]

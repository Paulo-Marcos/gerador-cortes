"""Modelos SQLAlchemy para o CortadorLive.

O pacote reexporta tudo para que `from app.models import X` siga valendo.
"""

from app.models.base import (
    Base,
    StatusCorte,
    StatusLiveCandidata,
    StatusProjeto,
    StatusShort,
)
from app.models.canal import (
    AvaliacaoBruto,
    AvaliacaoThumbnail,
    LayoutPreset,
    LiveCandidata,
    YoutubeVideoStat,
)
from app.models.projeto import Corte, MetadadoCorte, Projeto
from app.models.shorts import MetadadoShort, PublicacaoShort, Short
from app.models.snapshots import CorteSnapshot, ShortSnapshot

__all__ = [
    "AvaliacaoBruto",
    "AvaliacaoThumbnail",
    "Base",
    "Corte",
    "CorteSnapshot",
    "LayoutPreset",
    "LiveCandidata",
    "MetadadoCorte",
    "MetadadoShort",
    "Projeto",
    "PublicacaoShort",
    "Short",
    "ShortSnapshot",
    "StatusCorte",
    "StatusLiveCandidata",
    "StatusProjeto",
    "StatusShort",
    "YoutubeVideoStat",
]

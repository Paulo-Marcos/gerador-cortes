"""Configuração de render derivada do `Projeto` (versão do renderer + defaults).

Extraído de `pipeline_render` (E-006). `ProjetoRenderConfig` é imutável e sem
dependência de I/O — decide qual composição Remotion (V2) e quais props extras
(sombra/layout/fonte) cada render usa.
"""

from app.models import Projeto

# Presets tipograficos suportados pelo renderer Remotion (theme-v2.ts).
# Manter sincronizado com FONT_PRESETS_V2 e com FONTES_VALIDAS no router.
FONTE_PRESETS_VALIDOS = frozenset({"atual", "moderna", "cientifica", "minimalista", "tecnica"})


class ProjetoRenderConfig:
    """Configuração de render derivada do `Projeto` — qual versão do renderer
    (v1/v2) e nível padrão de sombra para cenas com sombra_nivel='auto'.

    Mantida como classe simples (não-dataclass) para evitar uma dependência
    extra em projetos antigos. Imutável após construção.
    """

    __slots__ = ("versao", "sombra_padrao", "layout_card_padrao", "fonte_preset")

    def __init__(
        self,
        versao: str = "v2",
        sombra_padrao: str = "nenhuma",
        layout_card_padrao: str = "vertical",
        fonte_preset: str = "atual",
    ) -> None:
        # V1 está desativada (compositions removidas do Root.tsx).
        # Qualquer valor de `versao` é normalizado para "v2".
        self.versao = "v2"
        self.sombra_padrao = (
            sombra_padrao if sombra_padrao in ("nenhuma", "leve", "media", "forte") else "nenhuma"
        )
        self.layout_card_padrao = (
            layout_card_padrao if layout_card_padrao in ("horizontal", "vertical") else "vertical"
        )
        self.fonte_preset = fonte_preset if fonte_preset in FONTE_PRESETS_VALIDOS else "atual"

    @classmethod
    def from_projeto(cls, projeto: Projeto | None) -> "ProjetoRenderConfig":
        if projeto is None:
            return cls()
        return cls(
            versao="v2",  # V1 desativada — forçar V2 mesmo se projeto antigo guardar "v1"
            sombra_padrao=getattr(projeto, "sombra_nivel_padrao", "nenhuma") or "nenhuma",
            layout_card_padrao=getattr(projeto, "layout_card_padrao", "vertical") or "vertical",
            fonte_preset=getattr(projeto, "fonte_preset", "atual") or "atual",
        )

    @property
    def overlay_composition(self) -> str:
        return "OverlaySceneV2" if self.versao == "v2" else "OverlayScene"

    @property
    def timeline_composition(self) -> str:
        return "OverlayTimelineV2" if self.versao == "v2" else "OverlayTimeline"

    @property
    def youtube_composition(self) -> str:
        return "CenaYouTubeV2" if self.versao == "v2" else "CenaYouTube"

    def overlay_props_extra(self) -> dict:
        """Props extras a injetar em renders V2 (sombra padrão da composição)."""
        if self.versao == "v2":
            return {
                "sombraNivelPadrao": self.sombra_padrao,
                "layoutCardPadrao": self.layout_card_padrao,
                "fontPreset": self.fonte_preset,
            }
        return {}

from app import editorial_identity
from app.services.app_settings import (
    AppSettings,
    AppSettingsService,
    LogLevel,
    OverlayCodec,
    RenderSettings,
)
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class RenderSettingsModel(BaseModel):
    """Ajustes do pipeline de renderização (D-191: editáveis pela UI)."""

    cooldown_sec: int
    overlay_concurrency: int
    bundle_cache_enabled: bool
    overlay_codec: OverlayCodec
    overlay_max_attempts: int
    grade_global_quality: int


class AppSettingsResponse(BaseModel):
    log_level: LogLevel
    filtro_global_padrao: str
    youtube_layout_padrao_global: str = "{}"
    capa_tiktok_layout: str = "{}"
    # D-450: velocidade com que os players de preview abrem.
    velocidade_player_padrao: float = 1.0
    # D-451: respiro (s) que o editor mostra antes/depois do corte.
    contexto_antes_seg: int = 60
    contexto_depois_seg: int = 300
    render: RenderSettingsModel
    # D-285: nome do mascote do canal ativo (identidade editorial no banco).
    # "" quando ainda não definido (fallback neutro) — a UI mostra placeholder.
    mascote_nome: str = ""


class UpdateAppSettingsRequest(BaseModel):
    log_level: LogLevel | None = None
    filtro_global_padrao: str | None = None
    # F-024: padrao GLOBAL do layout YouTube (escopo da aplicacao, nao do
    # projeto). JSON string com o preset compartilhado.
    youtube_layout_padrao_global: str | None = None
    capa_tiktok_layout: str | None = None
    # D-450: velocidade inicial dos players de preview (clampada no serviço).
    velocidade_player_padrao: float | None = None
    # D-451: janela de contexto do editor (clampada no serviço). Lados
    # independentes — a UI salva só o campo que o operador editou.
    contexto_antes_seg: int | None = None
    contexto_depois_seg: int | None = None
    # D-191: bloco de render editável pela UI (bloco completo).
    render: RenderSettingsModel | None = None
    # D-285: nome do mascote editável pela UI (grava no banco + espelha no yaml).
    mascote_nome: str | None = None


def _mascote_nome() -> str:
    """Nome do mascote do canal ativo para a resposta.

    Devolve "" no fallback neutro (nome não definido) para a UI exibir placeholder
    em vez do rótulo genérico "mascote"."""
    identidade = editorial_identity.identidade_do_mascote()
    return "" if identidade == editorial_identity.MASCOTE_NEUTRO else identidade.nome


def _to_response(app: AppSettings) -> AppSettingsResponse:
    return AppSettingsResponse(
        log_level=app.log_level,
        filtro_global_padrao=app.filtro_global_padrao,
        youtube_layout_padrao_global=app.youtube_layout_padrao_global,
        capa_tiktok_layout=app.capa_tiktok_layout,
        velocidade_player_padrao=app.velocidade_player_padrao,
        contexto_antes_seg=app.contexto_antes_seg,
        contexto_depois_seg=app.contexto_depois_seg,
        render=RenderSettingsModel(
            cooldown_sec=app.render.cooldown_sec,
            overlay_concurrency=app.render.overlay_concurrency,
            bundle_cache_enabled=app.render.bundle_cache_enabled,
            overlay_codec=app.render.overlay_codec,
            overlay_max_attempts=app.render.overlay_max_attempts,
            grade_global_quality=app.render.grade_global_quality,
        ),
        mascote_nome=_mascote_nome(),
    )


@router.get("/capa-tiktok/layout")
def obter_layout_da_capa_tiktok():
    """Onde cada componente da capa do TikTok esta, e onde estaria no padrao.

    O editor NAO recalcula a geometria: recebe a resolvida. Duplicar a conta no
    frontend criaria a divergencia que este epico passou inteiro evitando — um
    pixel de diferenca entre o que o operador arrasta e o que o Remotion
    desenha, sem erro nenhum aparecendo.
    """
    from app.domain.corte import capa_tiktok as layout_capa
    from app.services.capa_tiktok import _ajuste_do_layout

    return {
        "quadro": {"largura": layout_capa.LARGURA, "altura": layout_capa.ALTURA},
        # A faixa que a vitrine do perfil preserva (D-536). O editor desenha
        # como guia: e olhando para ela que o operador decide o que aceita
        # perder no recorte.
        "faixa_segura": {
            "y": layout_capa.TOPO_SEGURO,
            "h": layout_capa.BASE_SEGURA - layout_capa.TOPO_SEGURO,
        },
        "componentes": list(layout_capa.COMPONENTES),
        "lado_minimo": layout_capa.LADO_MINIMO,
        "padrao": _em_componentes(layout_capa.layout_padrao()),
        "atual": _em_componentes(layout_capa.montar_layout(_ajuste_do_layout())),
    }


def _em_componentes(layout) -> dict:
    """O layout no vocabulario do editor: etiqueta, arte, selo."""
    return {
        "etiqueta": layout.etiqueta.como_dict(),
        "arte": layout.frame.como_dict(),
        "selo": layout.selo.como_dict(),
    }


@router.get("", response_model=AppSettingsResponse)
async def get_settings():
    return _to_response(AppSettingsService.get())


@router.put("", response_model=AppSettingsResponse)
async def update_settings(body: UpdateAppSettingsRequest):
    updated = AppSettingsService.get()
    if body.log_level is not None:
        updated = AppSettingsService.update_log_level(body.log_level)
    if body.filtro_global_padrao is not None:
        updated = AppSettingsService.update_filtro_global_padrao(body.filtro_global_padrao)
    if body.youtube_layout_padrao_global is not None:
        updated = AppSettingsService.update_youtube_layout_padrao_global(
            body.youtube_layout_padrao_global
        )
    if body.capa_tiktok_layout is not None:
        updated = AppSettingsService.update_capa_tiktok_layout(body.capa_tiktok_layout)
    if body.velocidade_player_padrao is not None:
        updated = AppSettingsService.update_velocidade_player_padrao(body.velocidade_player_padrao)
    if body.contexto_antes_seg is not None or body.contexto_depois_seg is not None:
        updated = AppSettingsService.update_contexto_corte(
            antes_seg=body.contexto_antes_seg,
            depois_seg=body.contexto_depois_seg,
        )
    if body.render is not None:
        updated = AppSettingsService.update_render(
            RenderSettings(
                cooldown_sec=body.render.cooldown_sec,
                overlay_concurrency=body.render.overlay_concurrency,
                bundle_cache_enabled=body.render.bundle_cache_enabled,
                overlay_codec=body.render.overlay_codec,
                overlay_max_attempts=body.render.overlay_max_attempts,
                grade_global_quality=body.render.grade_global_quality,
            )
        )
    if body.mascote_nome is not None:
        editorial_identity.definir_nome_do_mascote(body.mascote_nome)
    return _to_response(updated)

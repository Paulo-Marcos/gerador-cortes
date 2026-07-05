from app.domain.overlay_codec import OverlayCodec
from app.services.app_settings import AppSettings, AppSettingsService, LogLevel, RenderSettings
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
    render: RenderSettingsModel


class UpdateAppSettingsRequest(BaseModel):
    log_level: LogLevel | None = None
    filtro_global_padrao: str | None = None
    # F-024: padrao GLOBAL do layout YouTube (escopo da aplicacao, nao do
    # projeto). JSON string com o preset compartilhado.
    youtube_layout_padrao_global: str | None = None
    # D-191: bloco de render editável pela UI (bloco completo).
    render: RenderSettingsModel | None = None


def _to_response(app: AppSettings) -> AppSettingsResponse:
    return AppSettingsResponse(
        log_level=app.log_level,
        filtro_global_padrao=app.filtro_global_padrao,
        youtube_layout_padrao_global=app.youtube_layout_padrao_global,
        render=RenderSettingsModel(
            cooldown_sec=app.render.cooldown_sec,
            overlay_concurrency=app.render.overlay_concurrency,
            bundle_cache_enabled=app.render.bundle_cache_enabled,
            overlay_codec=app.render.overlay_codec,
            overlay_max_attempts=app.render.overlay_max_attempts,
            grade_global_quality=app.render.grade_global_quality,
        ),
    )


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
    return _to_response(updated)

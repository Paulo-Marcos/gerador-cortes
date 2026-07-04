from app.services.app_settings import AppSettingsService, LogLevel
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class AppSettingsResponse(BaseModel):
    log_level: LogLevel
    filtro_global_padrao: str
    youtube_layout_padrao_global: str = "{}"


class UpdateAppSettingsRequest(BaseModel):
    log_level: LogLevel | None = None
    filtro_global_padrao: str | None = None
    # F-024: padrao GLOBAL do layout YouTube (escopo da aplicacao, nao do
    # projeto). JSON string com o preset compartilhado.
    youtube_layout_padrao_global: str | None = None


@router.get("", response_model=AppSettingsResponse)
async def get_settings():
    return AppSettingsService.get()


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
    return updated

"""Schemas de resposta das rotas de metadados do corte (D-722).

O `response_model` FILTRA: campo omitido aqui seria cortado da resposta.
"""

from datetime import datetime
from typing import Any

from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from pydantic.json_schema import SkipJsonSchema


class MetadadoDoCorteResponse(RespostaComCamposOpcionais):
    """Dois formatos. Corte ainda sem metadado: `id` nulo, os textos vazios e o
    Fire do corte. Com metadado: todas as colunas, mais as duas marcas
    editoriais, que moram no corte (D-713)."""

    id: str | None
    corte_id: str
    is_fire: bool
    titulo_youtube: str
    descricao_youtube: str
    tags_youtube: list[str]
    opcoes_titulo: list[str]
    opcoes_texto_capa: list[str]
    texto_capa: str
    prompt_thumbnail: str
    thumbnail_path: str
    # Só no formato com metadado: ausentes no outro, nunca nulos.
    candidato_shorts: bool | SkipJsonSchema[None] = None
    link_live_com_timestamp: str | SkipJsonSchema[None] = None
    canal_credito: str | SkipJsonSchema[None] = None
    # D-519/D-520: a capa vertical do TikTok e a etiqueta dela.
    thumbnail_tiktok_path: str | SkipJsonSchema[None] = None
    etiqueta_tiktok: str | SkipJsonSchema[None] = None
    prompt_capa_tiktok: str | SkipJsonSchema[None] = None
    numero_serie: int | SkipJsonSchema[None] = None
    cor_serie: str | SkipJsonSchema[None] = None
    criado_em: datetime | SkipJsonSchema[None] = None
    atualizado_em: datetime | SkipJsonSchema[None] = None


class GeracaoIniciadaResponse(RespostaApi):
    """A geração segue em segundo plano; a tela acompanha pelo que muda depois."""

    message: str
    corte_id: str


class FireAlternadoResponse(RespostaApi):
    is_fire: bool
    titulo_youtube: str


class ThumbnailEnviadaResponse(RespostaApi):
    message: str
    thumbnail_path: str


class PromptManualResponse(RespostaApi):
    """O prompt para rodar numa IA de fora e o formato que a resposta deve seguir."""

    prompt: str
    formato_esperado: dict[str, Any]


class MolduraAplicadaResponse(RespostaApi):
    message: str
    moldura: str


class ThumbnailRemovidaResponse(RespostaApi):
    message: str
    arquivo_removido: bool

"""Schemas de resposta das rotas de exportação (D-722).

Descrevem o que as rotas de `routers/export.py` devolvem — não o tipo que a tela
escreveu à mão. O `response_model` FILTRA: campo omitido aqui seria cortado.
"""

from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais


class FiltroExport(RespostaApi):
    """Um filtro de cinema do render (`FILTROS_CINEMA`)."""

    id: str
    nome: str
    descricao: str
    tem_filtro_visual: bool


class FiltrosResponse(RespostaApi):
    filtros: list[FiltroExport]


class VersaoExport(RespostaComCamposOpcionais):
    """Uma versão do corte com um filtro aplicado (multiversão).

    Os campos vêm da pasta da versão; `preview` vem do `meta.json` que o
    processamento grava ao lado do vídeo, e só existe quando o arquivo existe.
    """

    filtro: str
    nome: str
    descricao: str
    e_preview: bool
    completo_disponivel: bool
    tamanho_mb: float
    preview: bool | None = None


class VersoesResponse(RespostaApi):
    corte_id: str
    versoes: list[VersaoExport]


class MultiversionResponse(RespostaApi):
    """A geração roda em segundo plano; a resposta só confirma o disparo."""

    message: str
    filtros: list[str]

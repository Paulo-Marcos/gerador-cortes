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


# ─── Status de exportação do projeto ─────────────────────────────────────────


class StatusExportCorte(RespostaApi):
    """Onde cada corte aprovado está no caminho até a publicação."""

    corte_id: str
    numero: int
    titulo: str | None
    raw_pronto: bool
    grade_pronta: bool
    overlays_prontos: bool
    video_pronto: bool
    thumbnail_pronta: bool
    metadados_completos: bool
    pronto_publicar: bool
    titulo_youtube: str | None
    descricao_youtube: str | None
    thumbnail_path: str | None
    youtube_video_id: str
    youtube_url_publicado: str
    youtube_scheduled_at: str
    cenas_geradas: bool
    cenas_validadas: bool
    # D-516: "" = o operador ainda não disse que subiu no TikTok.
    tiktok_publicado_em: str


class StatusExportResponse(RespostaApi):
    projeto_id: str
    cortes: list[StatusExportCorte]


class StatusCorteBrutoResponse(RespostaApi):
    """A tarefa de gerar o bruto do corte (`nao_iniciado` quando nunca rodou)."""

    corte_id: str
    status: str
    clip_path: str | None
    clip_gerado: bool


# ─── Publicação ──────────────────────────────────────────────────────────────


class RetencaoArquivos(RespostaApi):
    """O que a limpeza de mídia fez depois do upload (D-456)."""

    liberado_mb: float
    retido_mb: float
    removidos: list[str]
    preservados: list[str]
    pulados: list[str]
    erros: list[str]


class YouTubeUploadResponse(RespostaComCamposOpcionais):
    """Upload novo, ou o corte que já estava publicado (`mensagem` explica). O
    erro não chega aqui: a rota o devolve como 500."""

    status: str
    video_id: str
    url: str
    scheduled_at: str | None
    mensagem: str | None = None
    retencao_arquivos: RetencaoArquivos | None = None


class MarcarPublicadoResponse(RespostaApi):
    """O vídeo conferido no canal autenticado e gravado no corte."""

    status: str
    video_id: str
    url: str
    titulo: str
    privacy_status: str
    upload_status: str
    scheduled_at: str
    mensagem: str


class LiberarPublicacaoResponse(RespostaApi):
    """A marca de um destino desfeita (D-566) — só a memória do app, nada lá fora."""

    status: str
    corte_id: str
    destino: str
    rotulo: str
    liberado: bool
    campos_limpos: list[str]
    video_pronto: bool
    mensagem: str


class AgendaDoUpload(RespostaApi):
    corte_id: str
    scheduled_at: str | None


class BulkYoutubeResponse(RespostaApi):
    message: str
    agenda: list[AgendaDoUpload]

"""Schemas Pydantic (request/response) do router de cortes.

Extraído de `cortes` (E-006). Reunir os contratos HTTP num único módulo mantém
o router focado nos handlers; todos os nomes seguem re-exportados pela fachada
`app.routers.cortes`, então imports existentes não mudam.
"""

from datetime import datetime

from pydantic import BaseModel


class DesvioSchema(BaseModel):
    inicio_hms: str
    fim_hms: str
    motivo: str


class CorteResponse(BaseModel):
    id: str
    projeto_id: str
    numero: int
    titulo_proposto: str
    resumo: str
    tema_central: str
    inicio_hms: str
    fim_hms: str
    inicio_seg: float
    fim_seg: float
    desvios: list
    status: str
    arquivo_clip_path: str
    # Duração real (segundos) do clip bruto medida via ffprobe. 0.0 se ainda
    # não gerou.  Frontend usa pra exibir duração exata no Player.
    duracao_clip_seg: float = 0.0
    is_leitura: int
    autor_leitura: str
    parte_leitura: int = 1
    transcricao_corte: list = []
    transcricao_final: list = []
    transcricao_final_texto: str = ""
    cenas_remotion: dict | list = []
    layout_youtube: dict = {}
    cenas_validadas: int = 0
    cenas_validadas_em: datetime | None = None
    # F-063: offset fino de áudio (lip-sync), em ms. Positivo atrasa, negativo adianta.
    audio_offset_ms: int = 0
    # F-054: sugestões de mudança de cena detectadas no bruto.
    segmentos_detectados: list = []
    is_fire: bool = False
    is_pos_producao: int = 0
    # F-058: influência manual do editor no prompt da thumbnail.
    hints_thumbnail: str = ""
    criado_em: datetime

    class Config:
        from_attributes = True


class AtualizarCorteRequest(BaseModel):
    titulo_proposto: str | None = None
    inicio_hms: str | None = None
    fim_hms: str | None = None
    inicio_seg: float | None = None
    fim_seg: float | None = None
    desvios: list | None = None
    status: str | None = None
    is_leitura: int | None = None
    autor_leitura: str | None = None
    parte_leitura: int | None = None
    transcricao_corte: list | None = None
    cenas_remotion: list | dict | None = None
    layout_youtube: dict | None = None
    # F-058: influência manual do editor no prompt da thumbnail.
    hints_thumbnail: str | None = None
    # F-063: offset fino de áudio (lip-sync) por corte, em milissegundos.
    audio_offset_ms: int | None = None


class RemoverDesvioRequest(BaseModel):
    desvio_index: int


class CriarCorteDesvioRequest(BaseModel):
    desvio_index: int
    titulo: str = ""


class AdicionarDesvioRequest(BaseModel):
    inicio_hms: str
    fim_hms: str
    motivo: str = ""


class CriarCorteManualRequest(BaseModel):
    inicio_hms: str
    fim_hms: str
    titulo_proposto: str | None = None


class DividirCorteRequest(BaseModel):
    """F-061: ponto onde o corte deve ser dividido em dois.

    Aceita `ponto_seg` (segundos absolutos, fonte primária do ponteiro do
    player) ou `ponto_hms` (HH:MM:SS) como fallback.
    """

    ponto_seg: float | None = None
    ponto_hms: str | None = None


class ReordenarCortesRequest(BaseModel):
    """F-057: nova ordem dos cortes do projeto.

    `cortes_ids` precisa conter exatamente os IDs dos cortes do projeto, na
    ordem desejada. O backend renumera (1..N) na ordem recebida.
    """

    cortes_ids: list[str]


class ImportarDesviosRequest(BaseModel):
    trechos: list


class GerarBrutoRequest(BaseModel):
    """Opt-ins da regeração do bruto (D-160).

    Só valem quando o corte JÁ tem bruto (regeração). Na 1ª geração o endpoint
    força a cadeia completa. Default = só o bruto (recorte + silêncios).
    """

    refazer_transcricao: bool = False
    refazer_cenas: bool = False


class DecisaoSegmentoRequest(BaseModel):
    decisao: str  # rejeitar | full | compartilhada


class ImportarCenasRequest(BaseModel):
    cenas: list | None = None
    formato: str | None = None

    class Config:
        extra = "allow"


class ValidarCenasRequest(BaseModel):
    validado: bool = True


class RenderPipelineRequest(BaseModel):
    # `filtro=None` (default) resolve para `AppSettings.filtro_global_padrao`
    # no service (`pipeline_render.renderizar_pipeline_otimizado` /
    # `RemotionRenderService.iniciar_render_background`). Antes era o literal
    # "cinematic_iii", que ignorava a configuracao global. F-030.
    filtro: str | None = None
    continuar: bool = True
    start_from: str = "auto"
    # `parar_em` (None = roda até o fim). Quando é uma fase intermediária
    # ("grade"/"overlays"), o pipeline faz um render PARCIAL: para após essa
    # fase e não finaliza o corte. Permite corrigir uma etapa isolada (ex.:
    # grade truncada) sem refazer o pipeline inteiro.
    parar_em: str | None = None

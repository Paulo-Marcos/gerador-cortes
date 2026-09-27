"""Schemas de resposta do ciclo do projeto (D-722).

Descrevem o que as rotas de `routers/projetos.py` devolvem ao excluir, rebaixar
o vídeo, reiniciar downloads, limpar arquivos, abrir a pasta e em torno da
análise (auditoria, prompt, importação, intervalo, transcrição). O
`response_model` FILTRA: campo omitido aqui seria cortado da resposta.
"""

from datetime import datetime

from app.models import StatusCorte
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais


class DownloadReiniciadoResponse(RespostaApi):
    message: str
    projeto_id: str


class DownloadsFalhadosResponse(RespostaApi):
    message: str
    total: int
    ids: list[str]


class LimpezaDeArquivosResponse(RespostaComCamposOpcionais):
    """Sem pasta do projeto, só a mensagem, o zero e a lista vazia; com pasta, o
    relatório da retenção de mídia inteiro (D-456)."""

    message: str
    # int | float: o ramo sem pasta manda 0 (inteiro), e um float o viraria 0.0.
    liberado_mb: int | float
    removidos: list[str]
    retido_mb: float | None = None
    preservados: list[str] | None = None
    pulados: list[str] | None = None
    erros: list[str] | None = None


class PastaAbertaResponse(RespostaApi):
    status: str
    dir_path: str


class AuditoriaCorteItem(RespostaApi):
    id: str
    numero: int
    titulo_proposto: str
    tema_central: str
    justificativa: str
    inicio_hms: str
    fim_hms: str
    duracao_min: float
    status: StatusCorte


class AuditoriaDescartado(RespostaApi):
    tema: str
    motivo: str


class AuditoriaAnaliseResponse(RespostaApi):
    """I-034: a trilha da última análise — os cortes com a justificativa e os
    blocos que a IA decidiu não cortar."""

    projeto_id: str
    ultima_analise_em: datetime | None
    total_cortes: int
    duracao_media_min: float
    cortes: list[AuditoriaCorteItem]
    descartados: list[AuditoriaDescartado]


class AnaliseImportadaResponse(RespostaApi):
    message: str
    total_cortes: int


class ReanaliseResponse(RespostaApi):
    message: str
    projeto_id: str
    cortes_removidos: int


class AnaliseDoIntervaloResponse(RespostaApi):
    message: str
    novos_cortes: int
    primeiro_numero: int


class TranscricaoRefeitaResponse(RespostaApi):
    message: str
    total_cortes_sincronizados: int

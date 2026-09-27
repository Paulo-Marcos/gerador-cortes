"""Schemas de resposta do ciclo do projeto (D-722).

Descrevem o que as rotas de `routers/projetos.py` devolvem ao excluir, rebaixar
o vídeo, reiniciar downloads e limpar arquivos. O `response_model` FILTRA:
campo omitido aqui seria cortado da resposta.
"""

from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais


class MensagemResponse(RespostaApi):
    message: str


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

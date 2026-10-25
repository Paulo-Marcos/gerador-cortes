"""Schemas de resposta do ciclo do projeto (D-722).

Descrevem o que as rotas de `routers/projetos.py` devolvem ao excluir, rebaixar
o vídeo, reiniciar downloads, limpar arquivos, abrir a pasta e em torno da
análise (auditoria, prompt, importação, intervalo, transcrição) — e o
próprio projeto, que desceu do router quando ganhou as redes do horizontal
(D-987): `projetos.py` estava no teto da catraca de tamanho. O
`response_model` FILTRA: campo omitido aqui seria cortado da resposta.
"""

from datetime import datetime
from typing import Any, Literal

from app.models import StatusCorte, StatusProjeto
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from app.services.render.pipeline_render import FONTE_PRESETS_VALIDOS
from pydantic import ConfigDict

# Os vocabulários que a configuração de render do projeto aceita. A rota de
# PATCH valida a escrita contra eles, e o schema de resposta os declara — o
# contrato do frontend recebe a união, não um texto qualquer (D-722).
SOMBRAS_VALIDAS = ("nenhuma", "leve", "media", "forte")
LAYOUTS_CARD_VALIDOS = ("horizontal", "vertical")
# O renderer V1 foi desativado para a escrita, mas há projetos antigos em v1.
VERSOES_RENDERER = ("v1", "v2")


class RedeDoProjeto(RespostaApi):
    """Uma rede do horizontal, vista pela live inteira (D-987).

    Mesma forma do `RedeDoCorte` do short (D-905): a tela lê os dois cartões
    com o mesmo vocabulário, e só a pergunta muda de altura.
    """

    plataforma: str
    publicados: int
    completa: bool


class ProjetoResponse(RespostaApi):
    model_config = ConfigDict(from_attributes=True)

    id: str
    youtube_url: str
    titulo_live: str
    canal_origem: str
    duracao_segundos: int
    data_live: str = ""
    # O enum e não Literal: o ORM entrega o membro do enum, que o Literal recusa.
    status: StatusProjeto
    progresso_download: float
    arquivo_video_path: str
    # I-023: filtro_padrao por projeto removido (vivia em Projeto.filtro_padrao).
    # Quem precisa do filtro de render usa GET /api/settings → filtro_global_padrao.
    arquivos_limpos: bool = False
    rebaixando_video: bool = False
    criado_em: datetime
    ultima_analise_em: datetime | None = None
    # Renderer V1 desativado — projetos sempre operam em V2.
    versao_renderer: Literal[VERSOES_RENDERER] = "v2"
    sombra_nivel_padrao: Literal[SOMBRAS_VALIDAS] = "nenhuma"
    layout_card_padrao: Literal[LAYOUTS_CARD_VALIDOS] = "vertical"
    layout_youtube_padrao: str | None = None
    fonte_preset: Literal[tuple(sorted(FONTE_PRESETS_VALIDOS))] = "atual"
    # F-052: pontuação herdada do ranking de lives no momento do download.
    pontuacao_ranking: float = 0.0
    total_cortes: int = 0
    total_publicados: int = 0
    total_aprovados: int = 0
    total_com_raw: int = 0
    total_video_pronto: int = 0
    total_com_meta: int = 0
    total_publicos: int = 0  # cortes já visíveis ao público
    proxima_publicacao: str = ""  # ISO8601 do próximo corte que ainda não é público
    # Brutos de Fire que a limpeza ainda deve preservar para a fabrica de Shorts.
    fires_pendentes: int = 0
    # D-987: as duas redes do 16:9, sempre, na ordem da tela; `completa` acende
    # o ícone do card quando TODOS os cortes com vídeo pronto já subiram nela.
    redes_do_horizontal: list[RedeDoProjeto] = []
    erro_msg: str | None = None


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


class SincroniaDaLegendaResponse(RespostaApi):
    message: str
    offset_ms: int
    cortes_sincronizados: int


class TelemetriaExportadaResponse(RespostaApi):
    """D-303: a telemetria editorial de todos os projetos, uma linha por corte.
    Com `?formato=csv`, a mesma coisa em CSV (não passa por aqui)."""

    total_cortes: int
    cortes: list[dict[str, Any]]

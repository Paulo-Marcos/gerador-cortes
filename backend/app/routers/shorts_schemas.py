"""Schemas de resposta da fábrica de shorts (D-722).

Descrevem o que as rotas de `routers/shorts.py` devolvem. O `response_model`
FILTRA: campo omitido aqui seria cortado da resposta. As cenas do short passam
como objeto (o contrato da cena é da D-725).
"""

from typing import Any, Literal

from app.domain.publicacao.ritmo_publicacao import EstadoItem
from app.models import StatusShort
from app.routers.cortes_schemas import PassoDoBruto
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from pydantic import ConfigDict
from pydantic.json_schema import SkipJsonSchema


class ContagemDeShorts(RespostaApi):
    """Quantos shorts o corte tem, por estágio da curadoria."""

    total: int
    sugerido: int
    aprovado: int
    rejeitado: int
    renderizado: int


class FireDaFabrica(RespostaApi):
    """Um corte na porta da fábrica: Fire ou indicado à mão (D-502)."""

    corte_id: str
    projeto_id: str
    projeto_titulo: str
    numero: int
    titulo: str
    tema_central: str
    duracao_seg: float
    # D-502: sem bruto o corte AINDA aparece — a tela oferece regerar.
    tem_bruto: bool
    bruto_mb: float
    is_fire: bool
    indicado: bool
    # D-503: há MP4 final para publicar no TikTok?
    tem_video_final: bool
    live_em_disco: bool
    # D-581: a mão humana já passou por aqui? Alimenta "onde eu parei".
    tem_edicao: bool
    # D-593: quando os shorts foram dados por publicados em todas as redes.
    finalizado_em: str | None
    shorts: ContagemDeShorts


class FiresResponse(RespostaApi):
    fires: list[FireDaFabrica]


class SegmentoDoShort(RespostaApi):
    inicio_seg: float
    fim_seg: float


class RetanguloDoPalco(RespostaApi):
    x: float
    y: float
    w: float
    h: float


class ShortResponse(RespostaApi):
    id: str
    corte_id: str
    numero: int
    titulo: str
    # O gancho de CURADORIA que a IA escreveu — vira a descrição do post.
    gancho: str
    # D-565: o título-gancho da ABERTURA. Vazio = sem gancho.
    gancho_tela: str
    # D-573: as últimas variações que a IA propôs.
    gancho_sugestoes: list[str]
    gancho_ate_seg: float
    gancho_cor: str
    gancho_realce: str
    # D-600: onde a caixa senta, em % do quadro. 0 = do padrão do corte.
    gancho_x: float
    gancho_y: float
    gancho_largura: float
    inicio_seg: float
    fim_seg: float
    # D-604: as fatias do bruto, na ordem de toque. Vazia = a janela única.
    segmentos: list[SegmentoDoShort]
    # A duração LÍQUIDA; `envelope_seg` é o span de onde a onde no bruto.
    duracao_seg: float
    envelope_seg: float
    score: float
    justificativa: str
    status: StatusShort
    foco_x: float | None
    foco_efetivo: float
    arquivo_short_path: str
    arquivo_previa_path: str
    arranjo_palco: str
    janela_cheia: str
    palco_preset: str
    moldura: str
    ajustes_palco: dict[str, RetanguloDoPalco]
    recortes_palco: dict[str, RetanguloDoPalco]
    fundo_palco: str
    fundo_editorial: str
    legenda_cor: str
    legenda_fonte: str
    # D-605: onde a legenda senta, em % do quadro. 0 = do palco padrão do corte.
    legenda_x: float
    legenda_y: float
    legenda_largura: float
    palco_short_preset: str
    origem: str
    cenas: list[dict[str, Any]]


class ShortsDoCorteResponse(RespostaApi):
    shorts: list[ShortResponse]


class ShortEditadoResponse(RespostaApi):
    short: ShortResponse


class SugestoesDeShortsResponse(RespostaApi):
    """Os candidatos que a IA propôs e, em `descartes`, por que recusou o resto."""

    shorts: list[ShortResponse]
    descartes: list[str]


class ShortsGeradosResponse(SugestoesDeShortsResponse):
    # D-472: o bruto teve de ser regerado antes (sem tocar na pós-produção).
    bruto_regerado: bool


class CenasSugeridasResponse(RespostaApi):
    short: ShortResponse
    descartes: list[str]


class EnquadramentoResponse(RespostaApi):
    """O foco achado pelo rosto — ou por que não achou."""

    short: ShortResponse
    achou: bool
    foco_x: float | None
    motivo: str
    quadros_analisados: int
    quadros_com_rosto: int
    aviso: str


class VariacoesDeGanchoResponse(RespostaApi):
    variacoes: list[str]


class BrutoDescartadoResponse(RespostaApi):
    # int | float: o relatório da limpeza pode somar zero inteiro.
    liberado_mb: int | float
    removidos: list[str]
    erros: list[str]


class ElegibilidadeResponse(RespostaApi):
    is_fire: bool
    candidato_shorts: bool
    # D-502: a fábrica abre para Fire OU para indicação manual.
    elegivel: bool
    tem_bruto: bool
    total_shorts: int


class FinalizacaoResponse(RespostaApi):
    corte_id: str
    finalizado_em: str | None


class PalavraDoBruto(RespostaApi):
    texto: str
    inicio_seg: float
    fim_seg: float


class TranscricaoDoBrutoResponse(RespostaApi):
    """As palavras com tempo do bruto; `fonte` diz de onde vieram (D-479)."""

    fonte: str
    palavras: list[PalavraDoBruto]


class PostResumido(RespostaApi):
    gerado: bool
    titulo: str
    hashtags: int


class CapaResumida(RespostaApi):
    tem_capa: bool
    instante_seg: float


class ShortProntoResponse(RespostaApi):
    """Um short renderizado que ainda falta em alguma rede (D-651)."""

    id: str
    corte_id: str
    numero: int
    titulo: str
    status: StatusShort
    arquivo_short_path: str
    inicio_seg: float
    duracao_seg: float
    corte_numero: int
    corte_titulo: str
    projeto_id: str
    projeto_titulo: str
    publicadas: list[str]
    pendentes: list[str]
    post: PostResumido
    capa: CapaResumida
    atualizado_em: str


class ProntosResponse(RespostaApi):
    shorts: list[ShortProntoResponse]


# ─── Palco e gancho (D-499, D-507, D-561, D-594) ────────────────────────────


class FundoDoCanal(RespostaApi):
    chave: str
    cor: str
    padrao: bool


class FundosResponse(RespostaApi):
    fundos: list[FundoDoCanal]


class ArranjoDoPalco(RespostaApi):
    """Um jeito de montar a tela do short e se as regiões do corte o permitem."""

    chave: str
    modo: str
    disposicao: str
    nome: str
    porque: str
    janelas: int
    possivel: bool
    impedimento: str


class ArranjosResponse(RespostaApi):
    arranjos: list[ArranjoDoPalco]


class RetanguloEmPixels(RespostaApi):
    # int | float: vem do layout (inteiro) ou de uma conta (fração).
    x: int | float
    y: int | float
    w: int | float
    h: int | float


class PresetDisponivel(RespostaApi):
    id: str
    nome: str


class PresetComRegioes(PresetDisponivel):
    regioes: list[str]


class EstadoDoPalcoResponse(RespostaApi):
    """As regiões que o palco do corte usa e de onde vieram."""

    preset: str
    origem: str
    regioes: dict[str, RetanguloEmPixels]
    arranjo_sugerido: str
    presets_disponiveis: list[PresetComRegioes]


class PalcoPadraoResponse(RespostaApi):
    palco_padrao: str
    nome: str
    disponiveis: list[PresetDisponivel]
    # Quantos trechos já têm palco próprio — e não seguem o padrão.
    customizados: int


class GanchoPadraoResponse(RespostaApi):
    gancho_padrao: str
    nome: str
    # A aparência do preset (o contrato é o do preset de gancho); {} sem preset.
    payload: dict[str, Any]
    disponiveis: list[PresetDisponivel]
    customizados: int


class PadraoEscolhidoPalcoResponse(RespostaApi):
    corte_id: str
    palco_padrao: str


class PadraoEscolhidoGanchoResponse(RespostaApi):
    corte_id: str
    gancho_padrao: str


class PadraoSeguidoResponse(RespostaApi):
    """Quantos trechos largaram o que tinham para seguir o padrão do corte."""

    corte_id: str
    liberados: int


class TelaDoShort(RespostaApi):
    largura: int
    altura: int


class RecorteDesenhavel(RespostaApi):
    """Uma janela do palco: o que ela mostra da live e onde senta no short."""

    regiao: str
    origem: RetanguloEmPixels
    destino: RetanguloEmPixels
    recorta: RetanguloEmPixels


class FaixaDaMoldura(RetanguloEmPixels):
    cor: str


class PlanoDesenhavelResponse(RespostaApi):
    """O palco do short como a prévia o desenha — a mesma resolução do render,
    com a aparência já herdada do corte (D-549, D-570, D-585, D-594, D-600)."""

    origem: str
    modelo: str | None
    arranjo: str
    arranjos: list[ArranjoDoPalco]
    regioes: dict[str, RetanguloEmPixels]
    canvas: TelaDoShort
    fundo: str
    fundo_editorial: str
    legenda_cor: str
    legenda_fonte: str
    legenda_x: float
    legenda_y: float
    legenda_largura: float
    gancho_cor: str
    gancho_realce: str
    gancho_ate_seg: float
    gancho_fonte: str
    gancho_tamanho: float
    gancho_x: float
    gancho_y: float
    gancho_largura: float
    recortes: list[RecorteDesenhavel]
    slots: dict[str, RetanguloEmPixels]
    ajustados: list[str]
    moldura: str
    faixas: list[FaixaDaMoldura]


# ─── Post e capa do short (D-578, D-581) ────────────────────────────────────


class PostDoShortResponse(RespostaApi):
    titulo: str
    descricao: str
    hashtags: list[str]
    # Falso = "ainda não escrevi", em vez de três campos vazios que parecem defeito.
    gerado: bool


class CapaGeradaResponse(RespostaApi):
    capa_path: str
    instante_seg: float
    tem_capa: bool


class CapaDoShortResponse(CapaGeradaResponse):
    """A capa gravada, ou o instante sugerido para gerar uma."""

    duracao_seg: float
    # A tela desenha o gancho por cima quando o instante cai dentro dele.
    gancho_ate_seg: float


class PromptDaCapaResponse(RespostaApi):
    prompt: str


class CapaTiktokDoCorteResponse(RespostaApi):
    """A capa vertical do TikTok do corte (D-519): o caminho e o nome do arquivo."""

    capa: str
    nome: str


class CapaTiktokMontadaResponse(CapaTiktokDoCorteResponse):
    etiqueta: str


# ─── Render e publicação (D-485, D-535, D-611, D-617) ───────────────────────


class RenderDisparadoResponse(RespostaApi):
    status: Literal["iniciado"]
    short_id: str
    estagio: Literal["previa", "final"]


class ProgressoDoRenderDoShort(RespostaApi):
    estagio: Literal["previa", "final"]
    concluido: bool
    erro: str | None
    fila: str | None  # D-843: por que ainda não começou; None = já tem vaga
    decorrido_seg: float
    passos: list[PassoDoBruto]


class ProgressoResponse(RespostaApi):
    """`render` nulo = sem render deste short neste processo: a tela cai no banco."""

    render: ProgressoDoRenderDoShort | None


class LogDoRenderResponse(RespostaApi):
    linhas: list[str]
    truncado: bool
    duracoes_ms: list[int]
    existe: bool


class PacoteDePublicacao(RespostaApi):
    """O que cada rede recebe, montado pela mesma função que os robôs usam."""

    plataforma: str
    rotulo: str
    modo: str
    titulo: str
    titulo_visivel: str
    descricao: str
    hashtags: list[str]
    # D-611: a caixa única de TikTok/Instagram.
    legenda: str
    avisos: list[str]


class PacotesResponse(RespostaApi):
    pacotes: list[PacoteDePublicacao]


class ResultadoDaPublicacao(RespostaComCamposOpcionais):
    """Varia com o destino: a API do YouTube devolve o vídeo e a URL; o pacote
    manual, a pasta e os textos; os robôs assistidos somam o relatório deles.
    Os campos daqui são o vocabulário comum — nenhum é garantido —, e o resto
    passa como veio."""

    model_config = ConfigDict(extra="allow")

    plataforma: str | SkipJsonSchema[None] = None
    modo: str | SkipJsonSchema[None] = None
    avisos: list[str] | SkipJsonSchema[None] = None
    url: str | SkipJsonSchema[None] = None
    pasta: str | SkipJsonSchema[None] = None
    video_id: str | SkipJsonSchema[None] = None
    capa_aplicada: bool | SkipJsonSchema[None] = None
    publicado: bool | SkipJsonSchema[None] = None
    # O pacote manual: o vídeo, a capa e os textos que ele leva.
    video: str | SkipJsonSchema[None] = None
    capa: str | SkipJsonSchema[None] = None
    titulo: str | SkipJsonSchema[None] = None
    descricao: str | SkipJsonSchema[None] = None
    hashtags: list[str] | SkipJsonSchema[None] = None
    # D-611: a caixa única de TikTok/Instagram.
    legenda: str | SkipJsonSchema[None] = None
    # O relatório dos robôs assistidos (D-537, D-546, D-580).
    passos: list[str] | SkipJsonSchema[None] = None
    resumo: str | SkipJsonSchema[None] = None
    agendado_para: str | SkipJsonSchema[None] = None
    chrome_aberto_agora: bool | SkipJsonSchema[None] = None
    vigiando: bool | SkipJsonSchema[None] = None
    # O preparo para subir à mão (D-503).
    pasta_aberta: bool | SkipJsonSchema[None] = None
    erro_ao_abrir: str | None = None
    url_upload: str | SkipJsonSchema[None] = None


class TiktokConfirmadoResponse(RespostaApi):
    tiktok_publicado_em: str


class ItemDoLote(RespostaApi):
    alvo_tipo: str
    alvo_id: str
    plataforma: str
    plataforma_rotulo: str
    rotulo: str
    estado: EstadoItem
    detalhe: str
    url: str


class RaiaDoLote(RespostaApi):
    plataforma: str
    rotulo: str
    exige_humano: bool
    aviso: str
    itens: list[ItemDoLote]


class LoteDePublicacao(RespostaApi):
    """A publicação em lote, rede a rede (D-617)."""

    lote_id: str
    criado_em: str
    cancelado: bool
    terminou: bool
    tiktok_assistido: bool
    instagram_assistido: bool
    publicar_sozinho: bool
    raias: list[RaiaDoLote]


class LoteAtualResponse(RespostaApi):
    lote: LoteDePublicacao | None


class LoteCanceladoResponse(RespostaApi):
    cancelado: bool
    lote: LoteDePublicacao | None


class LoteConfirmadoResponse(RespostaApi):
    confirmado: bool


class PublicacaoRegistrada(RespostaApi):
    alvo_id: str
    plataforma: str
    estado: str
    url: str
    detalhe: str
    publicado_em: str


class PublicacoesResponse(RespostaApi):
    publicacoes: list[PublicacaoRegistrada]

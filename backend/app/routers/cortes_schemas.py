"""Schemas Pydantic (request/response) do router de cortes.

Extraído de `cortes` (E-006). Reunir os contratos HTTP num único módulo mantém
o router focado nos handlers; todos os nomes seguem re-exportados pela fachada
`app.routers.cortes`, então imports existentes não mudam.
"""

from datetime import datetime
from typing import Any, Literal

from app.models import StatusCorte
from app.routers.resposta_api import PromptEmPartesResponse, RespostaApi
from app.services.render.render_progress import RenderState
from pydantic import BaseModel, ConfigDict, model_serializer
from pydantic.json_schema import SkipJsonSchema


class ItemDoCorte(BaseModel):
    """Um item de uma lista do corte (D-722): o que ele declara ganha tipo, o
    resto passa intacto.

    O `response_model` FILTRA a resposta: um item estrito perderia as chaves que
    não declara — foi assim que o CorteResponse cortou score e contextualização.
    Daí o extra="allow". E a chave que só alguns itens trazem não pode virar
    `null` nos outros: a serialização devolve só o que veio. (O TypedDict com
    extra="allow" não serve: no Pydantic 2.9 ele descarta as chaves extras ao
    serializar.)

    As chaves obrigatórias são as que aparecem em TODO item dos 831 cortes de uma
    cópia da PROD (26/09/2026); as opcionais, as que só alguns trazem. Os
    vocabulários abertos ficam `str`: um valor fora de um Literal derrubaria a
    leitura do corte inteiro com 500.
    """

    model_config = ConfigDict(extra="allow")

    # `plain`, e não `wrap`: medido nos 831 cortes, a volta pelo serializador
    # padrão dobrava o custo da resposta, e a transcrição tem milhares de linhas.
    # Sem anotação de retorno de propósito: com ela o Pydantic troca o schema do
    # item pelo do retorno (`dict`) e o contrato perde os campos.
    @model_serializer(mode="plain")
    def _so_as_chaves_que_vieram(self):
        dados = {
            chave: valor
            for chave, valor in self.__dict__.items()
            if chave in self.__pydantic_fields_set__
        }
        dados.update(self.__pydantic_extra__ or {})
        return dados


# Opcional no item: pode faltar, mas quando vem não é nulo. O `SkipJsonSchema`
# tira o `null` do contrato; o `None` só marca a ausência, que não é serializada.
Ausente = SkipJsonSchema[None]

CategoriaDoDesvio = Literal[
    "repeticao",
    "disfluencia",
    "tangente",
    "chat",
    "enrolacao",
    "imprecisao",
    "tom",
    "silencio",
    "outro",
]


class DesvioDoCorte(ItemDoCorte):
    """Um trecho a remover. A `categoria` sai sempre do vocabulário fechado:
    o `_corte_to_dict` a normaliza na leitura (D-422)."""

    inicio_hms: str
    fim_hms: str
    motivo: str
    categoria: CategoriaDoDesvio
    # Os trechos técnicos gravam segundos inteiros às vezes; `int | float` deixa
    # o número sair como foi guardado.
    inicio_seg: int | float | Ausente = None
    fim_seg: int | float | Ausente = None
    inicio_texto: str | Ausente = None
    fim_texto: str | Ausente = None
    # Quem marcou: claude, gemini, manual, tecnico, juncao (a tela não lista esta).
    origem: str | Ausente = None
    # O rótulo do fluxo manual/Gemini legado (DESVIO, REPETICAO).
    tipo: str | Ausente = None


class LinhaDaTranscricao(ItemDoCorte):
    start: float
    end: float
    texto: str
    # As palavras com tempo ({inicio_seg, texto}) ficam dict: são centenas de
    # milhares nos cortes e nenhuma tela as lê pelo corte; como modelo, custavam
    # um terço da resposta.
    palavras: list[dict[str, Any]] | Ausente = None
    # D-286/D-360: o falante da diarização (SPEAKER_00...). Ausente = sem diarização.
    speaker: str | Ausente = None


class LinhaDaTranscricaoFinal(LinhaDaTranscricao):
    """A linha da transcrição limpa: `inicio`/`fim` no tempo do bruto."""

    inicio: float
    fim: float


class SegmentoDetectadoDoCorte(ItemDoCorte):
    """F-054: uma mudança de cena sugerida no bruto. O `status` é gravado só
    pelo backend (sugerido, aceito_full, aceito_compartilhada, rejeitado)."""

    inicio: float
    fim: float
    score: float
    status: str


class FatiaDoArranjo(ItemDoCorte):
    """D-576: uma fatia da ordem de exibição, em tempo de live."""

    inicio_seg: float
    fim_seg: float


class CenaDoCorte(ItemDoCorte):
    """Uma cena do roteiro visual. O `_corte_to_dict` garante os quatro tempos;
    o resto varia por tipo de cena (até o `numero` vem int, float ou str)."""

    inicio: float
    fim: float
    inicio_seg: float
    fim_seg: float
    tipo: str | Ausente = None


class RoteiroDeCenasDoCorte(ItemDoCorte):
    """O roteiro visual no formato com envelope; o antigo é a lista pura."""

    cenas: list[CenaDoCorte] | Ausente = None
    formato: str | Ausente = None
    paleta: dict[str, Any] | Ausente = None
    retratos: dict[str, Any] | Ausente = None


class LayoutDoCorte(ItemDoCorte):
    """O layout do YouTube do corte. `{}` quando o corte ainda não tem um."""

    modo_padrao: str | Ausente = None
    regioes: list[dict[str, Any]] | Ausente = None


class CorteResponse(BaseModel):
    id: str
    projeto_id: str
    numero: int
    # D-448: posição fixada na mão pelo editor (1-based). None = segue o tempo,
    # que é o padrão — a UI usa isso para marcar o corte como "fora da ordem".
    posicao_fixada: int | None = None
    titulo_proposto: str
    resumo: str
    tema_central: str
    inicio_hms: str
    fim_hms: str
    inicio_seg: float
    fim_seg: float
    desvios: list[DesvioDoCorte]
    # O vocabulário do ciclo do corte (RN-04): a coluna é texto, mas só a tabela
    # de transições do domínio grava nela.
    status: StatusCorte
    arquivo_clip_path: str
    # Duração real (segundos) do clip bruto medida via ffprobe. 0.0 se ainda
    # não gerou.  Frontend usa pra exibir duração exata no Player.
    duracao_clip_seg: float = 0.0
    is_leitura: int
    autor_leitura: str
    parte_leitura: int = 1
    transcricao_corte: list[LinhaDaTranscricao] = []
    transcricao_final: list[LinhaDaTranscricaoFinal] = []
    transcricao_final_texto: str = ""
    cenas_remotion: RoteiroDeCenasDoCorte | list[CenaDoCorte] = []
    layout_youtube: LayoutDoCorte = LayoutDoCorte()
    cenas_validadas: int = 0
    cenas_validadas_em: datetime | None = None
    # F-063: offset fino de áudio (lip-sync), em ms. Positivo atrasa, negativo adianta.
    audio_offset_ms: int = 0
    # F-054: sugestões de mudança de cena detectadas no bruto.
    segmentos_detectados: list[SegmentoDetectadoDoCorte] = []
    # D-576: ordem de exibição dos blocos ([] = cronológica).
    arranjo_blocos: list[FatiaDoArranjo] = []
    is_fire: bool = False
    is_pos_producao: int = 0
    # F-058: influência manual do editor no prompt da thumbnail.
    hints_thumbnail: str = ""
    # I-034 e D-314: a justificativa e a proposta v2 da IA. `score` é {} em corte
    # antigo ou manual. Estavam no `_corte_to_dict`, mas o schema as cortava.
    justificativa: str = ""
    frase_gancho_hms: str = ""
    frase_gancho_texto: str = ""
    contextualizacao: str = ""
    score: dict[str, int | float] = {}
    # A publicação no YouTube, gravada no corte.
    youtube_video_id: str = ""
    youtube_url_publicado: str = ""
    youtube_scheduled_at: str = ""
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


class BlocoArranjoSchema(BaseModel):
    """Um bloco na fila de exibição do corte (D-576)."""

    posicao: int
    inicio_seg: float
    fim_seg: float
    duracao_seg: float
    # Duração já descontados os desvios DESTE bloco — é a que o editor vê.
    duracao_liquida_seg: float


class ArranjoResponse(BaseModel):
    corte_id: str
    inicio_seg: float
    fim_seg: float
    blocos: list[BlocoArranjoSchema]
    # True quando a ordem é a da live — inclusive num corte fatiado e não movido.
    cronologico: bool
    # A ordem mudou e já existe bruto gerado: ele está velho. Aviso, não ação —
    # nenhum artefato é apagado pelas costas do editor.
    bruto_desatualizado: bool


class DividirBlocoRequest(BaseModel):
    ponto_seg: float


class MoverBlocoRequest(BaseModel):
    de_indice: int
    para_indice: int


class FundirBlocoRequest(BaseModel):
    indice: int


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


class JuntarCortesRequest(BaseModel):
    """D-575: qual corte deve ser absorvido pelo corte da rota.

    Omitido, o backend usa o VIZINHO SEGUINTE na linha do tempo — o caso que
    motivou a feature (o corte acaba cedo e o próximo completa o argumento).
    """

    outro_corte_id: str | None = None


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


class CaminhoDaPastaResponse(RespostaApi):
    dir_path: str


class DeteccaoIniciadaResponse(RespostaApi):
    """A detecção de segmentos roda em segundo plano; pedir de novo enquanto roda
    responde `em_andamento`, sem disparar outra."""

    status: Literal["iniciado", "em_andamento"]
    corte_id: str


class SincroniaPosProducaoResponse(RespostaApi):
    status: Literal["ok", "nada_a_fazer"]
    mensagem: str


class PassoDoBruto(RespostaApi):
    chave: str
    label: str
    status: str


class ProgressoDoBrutoResponse(RespostaApi):
    """F-038: os passos do gerar/regerar bruto, para o acompanhamento."""

    passos: list[PassoDoBruto]


class FasesDoPipeline(RespostaApi):
    """Quais fases do render já têm artefato aproveitável em disco."""

    raw: bool
    grade: bool
    overlays: bool
    compose: bool
    render_final: bool
    encode: bool


class SituacaoDoPipelineResponse(RespostaApi):
    fases: FasesDoPipeline
    overlays_count: int
    tem_etapas_concluidas: bool
    state: RenderState
    # int | float: quem atualiza o progresso pode mandar fração.
    progress: int | float
    stage: str
    running: bool
    elapsed_seconds: float
    error: str


class RemotionStudioResponse(RespostaApi):
    """Onde abrir o Studio, o vídeo do corte e as props da composição (a forma
    das props é a da cena, D-725)."""

    studio_url: str
    video_url: str
    props: dict[str, Any]


class PicosDaOndaResponse(RespostaApi):
    """Os picos da waveform do editor; `cached` diz se vieram do arquivo de cache."""

    corte_id: str
    offset_sec: float
    duration_sec: float
    sample_rate: int
    points: int
    peaks: list[float]
    cached: bool


class RetratosDasCenas(RespostaApi):
    """O que a busca de retratos fez nas fichas biográficas."""

    total_fichas: int
    atualizados: int
    ja_tinham: int
    nao_encontrados: int
    sem_nome: int
    erros: int
    nomes_sem_retrato: list[str]
    nomes_com_erro: list[str]


class CenasDoCorteResponse(RespostaApi):
    """As cenas geradas ou importadas, já normalizadas. A forma de cada cena é o
    contrato da cena (D-725); aqui ela passa como objeto."""

    formato: str
    cenas: list[dict[str, Any]]
    retratos: RetratosDasCenas


class RetratosPreenchidosResponse(RespostaApi):
    message: str
    corte_id: str
    retratos: RetratosDasCenas
    cenas: list[dict[str, Any]]


class PromptDasCenasResponse(PromptEmPartesResponse):
    """Além das partes, o prompt inteiro num texto só."""

    prompt: str

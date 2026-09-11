"""
Modelos SQLAlchemy para o CortadorLive
"""

import enum
from datetime import datetime

from app.services import channels
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class StatusProjeto(str, enum.Enum):
    PENDENTE = "pendente"
    BAIXANDO = "baixando"
    TRANSCREVENDO = "transcrevendo"
    PRONTO = "pronto"
    ANALISANDO = "analisando"
    ANALISADO = "analisado"
    ERRO = "erro"


class StatusCorte(str, enum.Enum):
    PROPOSTO = "proposto"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    EDITADO = "editado"
    PROCESSADO = "processado"


class StatusShort(str, enum.Enum):
    """Estagio de um short dentro da fabrica (E-030).

    SUGERIDO    -> a IA propos o trecho; aguarda curadoria humana.
    APROVADO    -> o operador aceitou o candidato; entra na fila de producao.
    REJEITADO   -> descartado na curadoria; fica no historico, nao some.
    RENDERIZADO -> MP4 vertical pronto em `arquivo_short_path`.
    """

    SUGERIDO = "sugerido"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    RENDERIZADO = "renderizado"


class StatusLiveCandidata(str, enum.Enum):
    """Estado de uma live na fila de ranking (F-052).

    PENDENTE  → ainda elegível para aparecer no TOP 20.
    REJEITADA → o operador descartou; some do ranking, libera vaga p/ a próxima.
    PROMOVIDA → virou Projeto via botão "Baixar"; FK guarda o vínculo.
    """

    PENDENTE = "pendente"
    REJEITADA = "rejeitada"
    PROMOVIDA = "promovida"


class Projeto(Base):
    __tablename__ = "projetos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    youtube_url: Mapped[str] = mapped_column(String(500))
    titulo_live: Mapped[str] = mapped_column(String(500), default="")
    canal_origem: Mapped[str] = mapped_column(
        String(200), default=lambda: channels.identidade_do_canal_ativo().handle
    )
    duracao_segundos: Mapped[int] = mapped_column(Integer, default=0)
    data_live: Mapped[str] = mapped_column(String(20), default="")
    arquivo_video_path: Mapped[str] = mapped_column(String(1000), default="")
    transcricao_raw: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default=StatusProjeto.PENDENTE)
    progresso_download: Mapped[float] = mapped_column(Float, default=0.0)
    erro_msg: Mapped[str] = mapped_column(Text, default="")
    # I-023: filtro_padrao por projeto foi removido. Fonte única =
    # AppSettings.filtro_global_padrao (Ajustes). A coluna SQLite legada
    # (`filtro_padrao TEXT`) é ignorada pelo ORM mas tolerada no banco
    # antigo — sem necessidade de migração imediata.
    arquivos_limpos: Mapped[bool] = mapped_column(
        Integer, default=0
    )  # 0=não, 1=sim (SQLite usa Integer p/ bool)
    # D-527: o rebaixe da live limpa esta em curso.
    #
    # Campo proprio, e NAO o status BAIXANDO, de proposito: `reiniciar-download`
    # aceita projetos naquele status e apaga transcricao, titulo e duracao —
    # feito para download que falhou, nao para live ja analisada. Reusar o
    # status poria um botao destrutivo a um clique do projeto pronto.
    # Integer como o vizinho acima: SQLite guarda bool assim neste schema.
    rebaixando_video: Mapped[bool] = mapped_column(Integer, default=0)
    legenda_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    ultima_analise_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    # I-034: audit trail da última análise — array JSON dos blocos que a IA
    # classificou como NÃO_RECOMENDADO e descartou (cada item: tema, motivo).
    # Permite ao operador auditar o filtro editorial sem reabrir o prompt.
    descartados_analise: Mapped[str] = mapped_column(Text, default="[]")
    # D-286: mapa de falantes da diarização — {"SPEAKER_00": {"nome": "", "is_canal": true}, ...}.
    # `speaker` por segmento mora na transcricao_raw; o nome/rótulo (editável pelo
    # operador) mora aqui, para relabelar sem reprocessar a transcrição.
    falantes_map: Mapped[str] = mapped_column(Text, default="{}")
    # Renderer das cenas do Remotion: "v1" (atual/estável) ou "v2" (nova identidade).
    # Default v2: nova identidade editorial das cenas Remotion.
    versao_renderer: Mapped[str] = mapped_column(String(10), default="v2")
    # Nível padrão de sombra/overlay aplicado às cenas v2 deste projeto quando
    # a cena estiver com sombra_nivel="auto". Valores: nenhuma/leve/media/forte.
    sombra_nivel_padrao: Mapped[str] = mapped_column(String(20), default="nenhuma")
    layout_card_padrao: Mapped[str] = mapped_column(String(20), default="vertical")
    layout_youtube_padrao: Mapped[str] = mapped_column(Text, default="{}")
    # Preset tipografico dos cards/cenas Remotion v2.
    fonte_preset: Mapped[str] = mapped_column(String(30), default="atual")
    # F-052: pontuação herdada da tela de Ranking de Lives no momento do download.
    # 0.0 quando o projeto não veio do ranking (fluxo legado do YoutubeBrowser).
    pontuacao_ranking: Mapped[float] = mapped_column(Float, default=0.0)
    # D-372: voto MANUAL do operador (1-5) sobre a qualidade real da live, dado
    # depois de assistir/cortar — referência comparativa contra `pontuacao_ranking`,
    # que às vezes diverge. None enquanto o operador não votou.
    voto_qualidade_live: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    cortes: Mapped[list["Corte"]] = relationship(
        "Corte", back_populates="projeto", cascade="all, delete-orphan"
    )


class Corte(Base):
    __tablename__ = "cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    projeto_id: Mapped[str] = mapped_column(String(36), ForeignKey("projetos.id"))
    numero: Mapped[int] = mapped_column(Integer)
    # D-448: posição na lista quando o editor a fixou NA MÃO (1-based). NULL — o
    # caso normal — significa "siga o tempo": `numero` é derivado de `inicio_seg`
    # a cada operação que cria ou move corte. Antes o `numero` era carimbado na
    # criação, então corte nascido depois (do desvio, da 2ª passada da análise)
    # ia para o fim mesmo começando no meio da live. Ordem canônica em
    # `domain/ordem_cortes.py`.
    posicao_fixada: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    titulo_proposto: Mapped[str] = mapped_column(String(500), default="")
    resumo: Mapped[str] = mapped_column(Text, default="")
    tema_central: Mapped[str] = mapped_column(String(500), default="")
    # I-034: justificativa editorial da IA — 1-3 frases explicando POR QUE
    # este intervalo virou corte (em vez de virar desvio ou ser descartado),
    # incluindo defesa da duração escolhida. Usada para auditoria.
    justificativa: Mapped[str] = mapped_column(Text, default="")
    inicio_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    fim_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    # D-302: campos da proposta v2 da análise. `frase_gancho_*` é o ponto de
    # entrada mais forte do argumento (borda inicial editorial); `contextualizacao`
    # é a frase curta que situa o assunto (alimenta a 1ª cena, D-295; vazia =
    # sem contextualização); `score_json` é o ranking relativo {hook, flow,
    # value, total} entre os cortes da mesma análise. Vazios em análises de
    # skills anteriores à v2 (back-compat).
    frase_gancho_hms: Mapped[str] = mapped_column(String(20), default="")
    frase_gancho_texto: Mapped[str] = mapped_column(Text, default="")
    contextualizacao: Mapped[str] = mapped_column(Text, default="")
    score_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(50), default=StatusCorte.PROPOSTO)
    arquivo_clip_path: Mapped[str] = mapped_column(String(1000), default="")
    # Duração real (em segundos) do `arquivo_clip_path`, medida via ffprobe
    # após cada geração de bruto.  Usada pelo frontend para exibir a duração
    # exata do arquivo (evita estimativas baseadas em soma de segmentos que
    # acumulam drift).  0.0 quando ainda não há clip gerado.
    duracao_clip_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # F-063: deslocamento fino do áudio em relação ao vídeo (lip-sync), em
    # milissegundos. Positivo atrasa o áudio; negativo adianta. Aplicado na
    # geração do bruto e propaga para grade/overlay/render final. 0 = sem ajuste.
    audio_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    youtube_video_id: Mapped[str] = mapped_column(String(50), default="")
    youtube_url_publicado: Mapped[str] = mapped_column(String(200), default="")
    youtube_scheduled_at: Mapped[str] = mapped_column(String(30), default="")
    # D-512: quando o operador confirmou que subiu ESTE corte para o TikTok.
    #
    # O TikTok e publicacao MANUAL (a API so posta em modo privado sem
    # auditoria), entao ninguem alem dele sabe que aconteceu. A marca existe
    # porque a limpeza automatica do `upload_ready/video.mp4` passou a depender
    # de TODOS os destinos: antes ela apagava o arquivo no fim do upload do
    # YouTube, e o TikTok — que usa o MESMO MP4 — ficava sem material.
    #
    # NULL nao e "nao publicou": e "nao se sabe". A retencao trata os dois
    # igual, preservando o arquivo, porque disco a mais e incomodo e arquivo a
    # menos e re-render.
    tiktok_publicado_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    is_leitura: Mapped[int] = mapped_column(Integer, default=0)
    autor_leitura: Mapped[str] = mapped_column(String(200), default="")
    parte_leitura: Mapped[int] = mapped_column(Integer, default=1)
    transcricao_corte: Mapped[str] = mapped_column(Text, default="[]")
    transcricao_final: Mapped[str] = mapped_column(Text, default="[]")
    transcricao_final_texto: Mapped[str] = mapped_column(Text, default="")
    cenas_remotion: Mapped[str] = mapped_column(Text, default="[]")
    layout_youtube: Mapped[str] = mapped_column(
        Text,
        default='{"modo_padrao":"full","regioes":[]}',
    )
    # E-036/D-487: o preset cujos crops alimentam o PALCO VERTICAL do short.
    # Coluna propria, e nao um campo dentro de `layout_youtube`: aquele bloco e
    # do pipeline horizontal (e do i-035, travado), e escrever nele para servir
    # os shorts arriscaria o render que ja funciona. Vazio = deduzir do proprio
    # layout do corte, ou nada.
    palco_short_preset: Mapped[str] = mapped_column(String(200), default="")
    # F-054: lista JSON de segmentos detectados via PySceneDetect no bruto do
    # corte. Cada item: {inicio, fim, score, status}. Status: sugerido /
    # aceito_full / aceito_compartilhada / rejeitado. Aceitar materializa uma
    # região correspondente em `layout_youtube.regioes`; o segmento continua
    # aqui para auditoria do que a IA propôs.
    segmentos_detectados: Mapped[str] = mapped_column(Text, default="[]")
    # Marca explicita do operador de que as cenas do roteiro visual ja foram revisadas
    # e estao prontas. Usada como pill na pagina de cortes (entre Graded e Final).
    cenas_validadas: Mapped[int] = mapped_column(Integer, default=0)
    cenas_validadas_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    is_pos_producao: Mapped[int] = mapped_column(Integer, default=0)
    # F-058: influência manual do editor sobre a thumbnail. Texto livre
    # (pessoas a destacar, relações, ênfases de tema). Quando preenchido, é
    # anexado ao prompt da skill `thumbnail-prompt-expert` como direção
    # prioritária, somando-se ao raciocínio do capista. Vazio = comportamento
    # idêntico ao atual.
    hints_thumbnail: Mapped[str] = mapped_column(Text, default="")
    # D-334: quantas vezes a skill trechos-expert rodou neste corte (D-332
    # tornou `gerar_trechos_via_claude` aditivo — o total de desvios origem=
    # 'claude' deixou de indicar quantos cliques geraram os desvios). Log é
    # JSON lista de {"em", "adicionados", "total_apos"}, um item por invocação.
    trechos_geracoes: Mapped[int] = mapped_column(Integer, default=0)
    trechos_geracoes_log: Mapped[str] = mapped_column(Text, default="[]")
    # D-419: avaliação humana da qualidade DESTE corte, colhida quando o editor
    # manda gerar o bruto pela 1ª vez — com o corte fresco na cabeça. O voto da
    # live (`Projeto.voto_qualidade_live`, D-372) chega tarde demais para isso:
    # quando a live inteira termina, metade dos cortes já saiu da memória.
    # `voto` 1-5 (NULL = ainda não avaliado); `motivos` é lista JSON de slugs do
    # vocabulário em `domain/avaliacao_corte.py`. Entra na telemetria (D-303).
    voto_qualidade: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    voto_qualidade_motivos: Mapped[str] = mapped_column(Text, default="[]")
    voto_qualidade_comentario: Mapped[str] = mapped_column(Text, default="")
    voto_qualidade_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    projeto: Mapped["Projeto"] = relationship("Projeto", back_populates="cortes")
    metadado: Mapped["MetadadoCorte"] = relationship(
        "MetadadoCorte",
        back_populates="corte",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # E-030: shorts extraidos deste corte. `lazy` default (nao selectin) de
    # proposito — a esteira de cortes nao carrega shorts sem pedir.
    shorts: Mapped[list["Short"]] = relationship(
        "Short", back_populates="corte", cascade="all, delete-orphan"
    )


class CorteSnapshot(Base):
    """D-303: snapshot imutável da proposta da IA no momento da importação.

    Congela o que a análise propôs (título, tema, resumo, justificativa,
    bordas e desvios) ANTES de qualquer edição humana. Gravado uma única vez
    quando o corte nasce em `AnaliseService.importar_resultado` (ou na análise
    de intervalo) e nunca mais atualizado — é a régua proposta×final da
    telemetria editorial. Corte sem snapshot é sinal, não erro: o editor criou
    na mão (a IA não propôs) ou o corte é anterior à telemetria. Se o corte
    for deletado o snapshot fica órfão e fora do levantamento (v1 não mede
    cortes deletados).
    """

    __tablename__ = "corte_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cortes.id"), unique=True, index=True
    )
    numero: Mapped[int] = mapped_column(Integer, default=0)
    titulo_proposto: Mapped[str] = mapped_column(String(500), default="")
    tema_central: Mapped[str] = mapped_column(String(500), default="")
    resumo: Mapped[str] = mapped_column(Text, default="")
    justificativa: Mapped[str] = mapped_column(Text, default="")
    inicio_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    fim_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    # D-302: espelho dos campos v2 da proposta (frase-gancho, contextualização,
    # score) — a telemetria mede a proposta v2 contra o corte final.
    frase_gancho_hms: Mapped[str] = mapped_column(String(20), default="")
    frase_gancho_texto: Mapped[str] = mapped_column(Text, default="")
    contextualizacao: Mapped[str] = mapped_column(Text, default="")
    score_json: Mapped[str] = mapped_column(Text, default="{}")
    # Proveniência da análise que propôs o corte: "claude" (pipeline interno)
    # ou "manual" (paste de JSON de IA externa/n8n). Novos providers registram
    # o próprio rótulo aqui.
    origem_analise: Mapped[str] = mapped_column(String(30), default="claude")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class YoutubeVideoStat(Base):
    """D-305: métricas lifetime de UM vídeo publicado no canal do operador.

    Levantamento do canal INTEIRO (não só os cortes deste app): cada upload vira
    uma linha, atualizada por `video_id` (upsert idempotente) a cada sync via
    YouTube Analytics API. `corte_id` casa a métrica com um corte local quando o
    vínculo é conhecido — por `Corte.youtube_video_id` (match_por_titulo=0) ou,
    na falta dele, por título normalizado (match_por_titulo=1, heurística). Vídeos
    sem corte local também entram: o objetivo é calibrar as faixas de duração e o
    padrão de título contra o desempenho real. CTR/impressões ficam de fora — a
    Analytics API pública não os expõe (ver D-305).
    """

    __tablename__ = "youtube_video_stats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    video_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    canal_id: Mapped[str] = mapped_column(String(60), default="")
    titulo: Mapped[str] = mapped_column(String(500), default="")
    duracao_seg: Mapped[float] = mapped_column(Float, default=0.0)
    publicado_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    # Métricas lifetime (YouTube Analytics API v2).
    views: Mapped[int] = mapped_column(Integer, default=0)
    estimated_minutes_watched: Mapped[float] = mapped_column(Float, default=0.0)
    average_view_duration_seg: Mapped[float] = mapped_column(Float, default=0.0)
    average_view_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    subscribers_gained: Mapped[int] = mapped_column(Integer, default=0)
    # Casamento com corte local (nullable): por video_id (match_por_titulo=0) ou
    # por título normalizado (match_por_titulo=1). Vídeo sem corte local fica com
    # corte_id nulo e ainda entra nos levantamentos.
    corte_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("cortes.id"), nullable=True, default=None, index=True
    )
    match_por_titulo: Mapped[int] = mapped_column(Integer, default=0)
    sincronizado_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


class Short(Base):
    """Trecho vertical extraido de um corte Fire (E-030, D-452).

    Reativa as tabelas que a D-345 deixou ORFAS (sem DROP) ao remover a feature
    morta — os registros de PROD continuam la e voltam a ter modelo.

    INVARIANTE: `inicio_seg`/`fim_seg` estao no espaco de tempo do BRUTO (o clip
    ja sem os desvios removidos), NAO no da live. E do bruto que o short e
    recortado; usar os tempos da live dessincroniza todo candidato.
    """

    __tablename__ = "shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"))
    numero: Mapped[int] = mapped_column(Integer)
    titulo_sugerido: Mapped[str] = mapped_column(String(500), default="")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # E-030: o que a IA usa para o operador escolher entre bons candidatos.
    # `gancho` e a frase que precisa segurar os 3 primeiros segundos; `score`
    # ordena a lista; `justificativa` explica a nota (colunas novas sobre as
    # tabelas antigas — a reconciliacao da D-403 as adiciona sozinha no boot).
    gancho: Mapped[str] = mapped_column(String(500), default="")
    score: Mapped[float] = mapped_column(Float, default=0.0)
    justificativa: Mapped[str] = mapped_column(Text, default="")
    # D-464: onde o recorte 9:16 se centra na horizontal (0.0 a 1.0). NULL = deriva
    # do layout do corte (a facecam), que e o default certo na maioria das lives;
    # valor gravado = o operador discordou depois de ver o enquadramento.
    foco_x: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    cenas_remotion: Mapped[str] = mapped_column(Text, default="[]")
    # D-565: o titulo-gancho que aparece na ABERTURA do short. Vazio = sem
    # gancho, que e o comportamento de antes desta demanda.
    #
    # Coluna NOVA, e nao reuso do `gancho` acima, por um motivo concreto: aquele
    # ja e a DESCRICAO do post publicado (`publicacao_destinos.montar_contexto_
    # do_short`). Reaproveita-lo reescreveria em silencio a descricao de todo
    # short ja curado — e o operador so descobriria depois de publicado.
    #
    # Os dois textos tambem sao de generos diferentes: o `gancho` da IA e uma
    # frase de curadoria ("qual e a graca deste trecho"), e este e o cartao de
    # 4 a 7 palavras que segura o dedo no feed. O primeiro alimenta o gerador do
    # segundo; nao sao a mesma frase.
    #
    # E NAO e uma cena (`cenas_remotion`, hoje desligada em `CENAS_LIGADAS`):
    # cena era texto em qualquer momento, N vezes; o gancho e um so, ancorado no
    # zero. Campos separados para que religar um nunca mexa no outro.
    gancho_tela: Mapped[str] = mapped_column(String(200), default="")
    # Quanto tempo o gancho fica em tela. 0 = o padrao de `domain/gancho_short`.
    gancho_ate_seg: Mapped[float] = mapped_column(Float, default=0.0)
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(50), default=StatusShort.SUGERIDO)
    # D-484: quem propos este trecho — "ia" ou "manual".
    #
    # NAO e informativo: e o que mantem o short manual VIVO. `registrar_sugestoes`
    # apaga todos os candidatos ainda SUGERIDOS ao regerar, porque refazer o
    # palpite da maquina e descartar o palpite anterior. Sem esta coluna, um
    # trecho marcado a mao pelo operador seria varrido junto — e em silencio, na
    # proxima vez que alguem clicasse em gerar shorts.
    origem: Mapped[str] = mapped_column(String(20), default="ia")
    arquivo_short_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-483: o MP4 de PREVIA — vertical com legenda e cenas, sem o filtro. Serve
    # para julgar antes de gastar a passada boa, e e descartavel: finalizar
    # reprocessa do zero, nao incrementa este arquivo.
    #
    # Coluna separada, e nao um novo valor de StatusShort, de proposito: o enum
    # e contrato (vale para a API e para os 13 registros que ja existem em
    # PROD), e o estagio se deduz sem ele — tem previa, tem final, ou nenhum.
    arquivo_previa_path: Mapped[str] = mapped_column(String(1000), default="")
    # E-036/D-487: o arranjo do palco deste candidato. Vazio = automatico, que
    # deduz das regioes disponiveis. Por SHORT e nao por corte porque o estilo
    # muda dentro do mesmo corte: um trecho mostra a tela, o seguinte e so fala.
    # D-498: o preset DESTE short, quando ele discorda do corte. Numa live longa
    # a cena do OBS muda — minuto 3 e rosto cheio, minuto 11 e tela
    # compartilhada — e as regioes mudam junto. Vazio = herda do corte, que
    # segue sendo o default para a maioria dos trechos.
    palco_preset: Mapped[str] = mapped_column(String(200), default="")
    # D-501/D-508: a assinatura do canal em volta — "palco" (fundo com textura,
    # chrome e molduras, em PNG do Remotion) ou "nenhuma". Ortogonal ao arranjo:
    # vale para qualquer montagem, e amarra-la a uma exigiria duplicar cada
    # arranjo em duas versoes.
    moldura: Mapped[str] = mapped_column(String(20), default="palco")
    # D-507: como a tela e montada — "cheia", "dividida_empilhada" ou
    # "dividida_insert". Vazio deduz das regioes marcadas.
    #
    # Substitui o `modelo_palco`, que oferecia quatro opcoes onde havia duas
    # decisoes: os quatro modelos misturavam "quantas janelas" com "qual regiao
    # alimenta cada uma", e por isso pareciam repetir o recorte.
    arranjo_palco: Mapped[str] = mapped_column(String(40), default="")
    # D-507: em modo CHEIA, qual regiao preenche a janela unica. E aqui que o
    # enquadramento deixa de ser botao a parte: com uma janela so, o recorte
    # dela E o enquadramento.
    janela_cheia: Mapped[str] = mapped_column(String(20), default="")
    # D-493: os slots que o operador MOVEU, como sobreposicao PARCIAL sobre o
    # modelo — `{"pessoa": {"x":..,"y":..,"w":..,"h":..}}`. Chave ausente herda
    # do modelo; materializar os defaults ao gravar apagaria a heranca, e trocar
    # de modelo depois nao moveria mais nada (mesma regra do layout horizontal).
    ajustes_palco: Mapped[str] = mapped_column(Text, default="{}")
    # D-499: o RECORTE deste short sobre o quadro-fonte — o que sai da live, em
    # pixels do bruto. `{"pessoa": {"x":..,"y":..,"w":..,"h":..}}`, sobreposicao
    # PARCIAL sobre as regioes do preset, mesma regra de heranca do
    # `ajustes_palco`.
    #
    # Ate aqui o crop vinha pronto do preset do canal e so o SLOT era editavel:
    # dava para dizer onde o bloco cai, nao o que ele mostra. Numa live em que a
    # facecam muda de lugar no meio, o preset do corte fica errado para UM
    # trecho — e nao havia como consertar so aquele.
    recortes_palco: Mapped[str] = mapped_column(Text, default="{}")
    # D-499: a CHAVE da paleta do canal usada como fundo (ex.: "fundoPalco").
    # Vazio = o default do canal. Guardamos a chave e nao a cor: gravar o hex
    # congelaria a paleta do dia, e trocar o tema do canal deixaria os shorts
    # antigos com a cor velha.
    fundo_palco: Mapped[str] = mapped_column(String(60), default="")
    # D-552: a TEXTURA do palco deste short — um id de `YOUTUBE_BACKGROUND`,
    # nao uma cor.
    #
    # Coluna propria, e nao reaproveitar `fundo_palco`: aquela guarda uma CHAVE
    # DA PALETA e alimenta a cor de base do ffmpeg. Trocar o significado dela
    # faria os shorts ja gravados apontarem para uma textura inexistente, e o
    # sintoma seria o palco cair no default sem ninguem entender por que.
    #
    # Vazio = a textura padrao do canal.
    fundo_editorial: Mapped[str] = mapped_column(String(60), default="")
    # D-552: qual preset de PALCO foi aplicado neste short.
    #
    # Aplicar um preset COPIA valores (arranjo, janela, recortes, textura) — nao
    # cria um vinculo vivo. Sem guardar de onde vieram, a tela nao tinha como
    # dizer "este e o palco tal", e o operador criava um preset que nunca mais
    # aparecia em lugar nenhum.
    #
    # A marca e limpa assim que qualquer um desses valores muda por fora, para
    # ela nunca afirmar uma origem que deixou de ser verdade.
    palco_short_preset: Mapped[str] = mapped_column(String(200), default="")
    # D-563: a cor da palavra CORRENTE da legenda, em hex ("#9bcfe3").
    #
    # Guardamos o hex resolvido, e nao uma chave de catalogo, porque quem
    # desenha a legenda sao DOIS lugares — a previa no navegador e o Remotion no
    # render. Uma chave obrigaria os dois a manterem a mesma tabela de cores, e
    # a licao da D-558 e que duas copias da mesma tabela divergem: o
    # `StageChrome` do frontend ficou com 1920x1080 cravado enquanto o do
    # renderer aprendia a receber o quadro, e ninguem percebeu por meses.
    #
    # O hex nao tem esse problema: e o proprio valor, igual nos dois lados.
    #
    # Vazio = a cor de acento do canal, que e o que sempre foi.
    legenda_cor: Mapped[str] = mapped_column(String(20), default="")
    # D-563: a familia da fonte da legenda ("Anton"), pela mesma razao do hex:
    # o valor viaja, e nao uma chave que previa e renderer teriam de traduzir.
    # Vazio — ou uma familia que o renderer nao carrega — cai na fonte do canal.
    legenda_fonte: Mapped[str] = mapped_column(String(60), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    corte: Mapped["Corte"] = relationship("Corte", back_populates="shorts")
    metadado: Mapped["MetadadoShort"] = relationship(
        "MetadadoShort",
        back_populates="short",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class MetadadoShort(Base):
    """Metadados de publicacao de um short (E-030, D-452).

    Espelha `MetadadoCorte` no que o short precisa. Campos por plataforma
    (Instagram, TikTok) sao escopo do E-035 e entram quando houver destino.
    """

    __tablename__ = "metadados_shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    short_id: Mapped[str] = mapped_column(String(36), ForeignKey("shorts.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")
    frase_capa: Mapped[str] = mapped_column(String(100), default="")
    # D-565 (onda 4): o QUADRO de capa deste short, relativo ao projeto.
    #
    # Um frame do proprio short, e nao uma arte montada como a do corte. A capa
    # vertical do corte existe porque o video dele e DEITADO — a imagem 16:9
    # viraria uma faixa fina num quadro vertical. O short ja nasce 9:16, com o
    # palco, a moldura e o fundo do canal em volta: montar arte por cima dele
    # trocaria um quadro que ja e do canal por uma ilustracao.
    capa_path: Mapped[str] = mapped_column(String(1000), default="")
    # Em que segundo do SHORT o quadro foi tirado. Guardado para o operador
    # poder reabrir a escolha, e para refazer a capa depois de um render novo
    # sem ter de procurar o instante outra vez.
    capa_instante_seg: Mapped[float] = mapped_column(Float, default=0.0)
    youtube_video_id: Mapped[str] = mapped_column(String(50), default="")
    youtube_url_publicado: Mapped[str] = mapped_column(String(200), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    short: Mapped["Short"] = relationship("Short", back_populates="metadado")


class LayoutPreset(Base):
    """Preset reutilizavel de layout YouTube (F-048).

    tipo='completo' guarda um YoutubeLayout inteiro (modo/fundo/placa/compartilhada);
    tipo='posicionamento' guarda apenas o bloco compartilhada (crops/slots/telas) —
    util para aplicar so o posicionamento num segmento sem mexer em fundo/placa.
    """

    __tablename__ = "layout_presets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    nome: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[str] = mapped_column(String(20), default="completo")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class MetadadoCorte(Base):
    __tablename__ = "metadados_cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")
    opcoes_titulo: Mapped[str] = mapped_column(Text, default="[]")
    opcoes_texto_capa: Mapped[str] = mapped_column(Text, default="[]")
    texto_capa: Mapped[str] = mapped_column(String(100), default="")
    link_live_com_timestamp: Mapped[str] = mapped_column(String(500), default="")
    canal_credito: Mapped[str] = mapped_column(
        String(200), default=lambda: channels.identidade_do_canal_ativo().credito
    )
    prompt_thumbnail: Mapped[str] = mapped_column(Text, default="")
    thumbnail_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-519: a capa VERTICAL, do TikTok. Coluna propria e nao reuso da de cima
    # porque as duas imagens tem formatos e trabalhos diferentes: a do YouTube e
    # 16:9 e disputa um clique numa lista; esta e 9:16 (o TikTok mostra o video
    # deitado com tarjas, mas a capa ocupa o quadro inteiro) e serve a vitrine
    # do perfil, onde nove capas sao vistas juntas. Guardar uma so faria a
    # errada aparecer em algum dos dois lugares.
    thumbnail_tiktok_path: Mapped[str] = mapped_column(String(1000), default="")
    # D-520: as 2-3 palavras da capa vertical. Guardadas porque formam o
    # vocabulario do canal: a skill le as etiquetas recentes para REPETIR o nome
    # do assunto entre cortes, que e o que da coerencia a grade do perfil.
    etiqueta_tiktok: Mapped[str] = mapped_column(String(80), default="")
    # D-524: o prompt da ARTE da capa vertical. O app nao desenha: escreve o
    # prompt, o operador gera no agente capista dele e sobe a imagem de volta —
    # o mesmo fluxo manual que a D-413 consolidou no horizontal.
    prompt_capa_tiktok: Mapped[str] = mapped_column(Text, default="")
    is_fire: Mapped[bool] = mapped_column(Integer, default=0)
    # D-502: o corte foi indicado para a fabrica de shorts A MAO.
    #
    # Separado do Fire de proposito. Fire e um julgamento editorial sobre o CORTE
    # ("isso e bom"); indicar para shorts e uma aposta sobre um TRECHO dele
    # ("tem um pedaco que renderia"). Um corte mediano pode ter um momento
    # otimo, e amarrar as duas marcas obrigaria a mentir sobre o corte inteiro
    # para chegar no trecho.
    candidato_shorts: Mapped[bool] = mapped_column(Integer, default=0)
    numero_serie: Mapped[int] = mapped_column(Integer, default=1)
    cor_serie: Mapped[str] = mapped_column(String(100), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    corte: Mapped["Corte"] = relationship("Corte", back_populates="metadado")


class AvaliacaoThumbnail(Base):
    """Avaliação humana de um par prompt+imagem de thumbnail (D-066).

    Cada linha é um registro do histórico: no momento em que o editor avalia,
    guardamos um *snapshot* do prompt e da imagem (que podem ser regerados
    depois) junto com o veredito rápido e, opcionalmente, notas por critério e
    comentário. O objetivo é acumular uma base que, mais adiante, um agente usa
    para descobrir o que os melhores prompts têm em comum e refinar a skill
    `thumbnail-prompt-expert`.

    Aditivo: não altera o fluxo atual de geração de prompt/imagem.
    """

    __tablename__ = "avaliacoes_thumbnail"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), index=True)
    # Snapshots do par avaliado (o prompt/imagem do corte podem mudar depois).
    prompt_snapshot: Mapped[str] = mapped_column(Text, default="")
    thumbnail_path_snapshot: Mapped[str] = mapped_column(String(1000), default="")
    titulo_youtube_snapshot: Mapped[str] = mapped_column(String(200), default="")
    texto_capa_snapshot: Mapped[str] = mapped_column(String(200), default="")
    # Veredito rápido obrigatório: otimo | bom | regular | ruim.
    veredito: Mapped[str] = mapped_column(String(20), default="bom")
    # Critérios detalhados opcionais (1-5); NULL = não avaliado.
    nota_fidelidade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nota_clareza: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nota_beleza: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nota_impacto: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nota_honestidade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comentario: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AvaliacaoBruto(Base):
    """Avaliação automática da ESTRUTURA do bruto de um corte (D-447).

    Roda ao final de cada geração de bruto, sobre a transcrição já sem os
    trechos removidos e com as emendas marcadas. Uma linha POR GERAÇÃO (não uma
    por corte): o interesse é justamente a série — o corte que era `quebrada` na
    primeira tentativa e virou `coesa` depois de o editor mexer nas bordas conta
    uma história que o "estado atual" apagaria.

    `projeto_id` é replicado (e não só derivado via corte) para que o
    levantamento por live não precise de join, e sobreviva ao corte deletado.
    Vocabulário e validação em `domain/avaliacao_bruto.py`.
    """

    __tablename__ = "avaliacoes_bruto"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), index=True)
    projeto_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    # Nota 1-5 na MESMA escala do voto humano por corte (D-419), de propósito:
    # é o que permite cruzar o que a IA achou com o que o editor achou.
    nota: Mapped[int] = mapped_column(Integer, default=0)
    veredito: Mapped[str] = mapped_column(String(20), default="aceitavel")
    parecer: Mapped[str] = mapped_column(Text, default="")
    # Lista JSON de {tipo, gravidade, momento, descricao} — tipos do vocabulário.
    apontamentos: Mapped[str] = mapped_column(Text, default="[]")
    # Contexto da geração avaliada: sem isso a estatística não distingue "nota 2
    # em bruto de 40s com 12 emendas" de "nota 2 em bruto de 8min sem emenda".
    duracao_seg: Mapped[float] = mapped_column(Float, default=0.0)
    total_emendas: Mapped[int] = mapped_column(Integer, default=0)
    removido_seg: Mapped[float] = mapped_column(Float, default=0.0)
    # Proveniência: qual modelo e qual corpo de skill produziram este parecer.
    modelo: Mapped[str] = mapped_column(String(80), default="")
    skill_sha: Mapped[str] = mapped_column(String(16), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LiveCandidata(Base):
    """Live do canal-fonte avaliada para entrar na fila de cortes (F-052).

    Fluxo: a tela de Ranking gera o top 20 a partir das candidatas com
    `status=PENDENTE`. Quando o operador rejeita, vira REJEITADA e some da lista;
    quando baixa, vira PROMOVIDA e ganha um `projeto_id`. As métricas brutas
    ficam aqui mesmo (vivas só na avaliação inicial); a pontuação se replica
    em `Projeto.pontuacao_ranking` no momento da promoção.
    """

    __tablename__ = "live_candidatas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    video_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    canal_id: Mapped[str] = mapped_column(String(60), default="")
    canal_origem: Mapped[str] = mapped_column(String(200), default="")
    titulo: Mapped[str] = mapped_column(String(500), default="")
    thumbnail_url: Mapped[str] = mapped_column(String(500), default="")
    duracao_iso: Mapped[str] = mapped_column(String(20), default="")
    data_publicacao: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comentarios: Mapped[int] = mapped_column(Integer, default=0)
    sentimento_score: Mapped[float] = mapped_column(Float, default=0.0)
    sentimento_destaques: Mapped[str] = mapped_column(Text, default="[]")
    pontuacao_total: Mapped[float] = mapped_column(Float, default=0.0)
    componentes_pontuacao: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20), default=StatusLiveCandidata.PENDENTE)
    projeto_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projetos.id"), nullable=True
    )
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

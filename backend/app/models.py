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
    legenda_offset_ms: Mapped[int] = mapped_column(Integer, default=0)
    ultima_analise_em: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
    # I-034: audit trail da última análise — array JSON dos blocos que a IA
    # classificou como NÃO_RECOMENDADO e descartou (cada item: tema, motivo).
    # Permite ao operador auditar o filtro editorial sem reabrir o prompt.
    descartados_analise: Mapped[str] = mapped_column(Text, default="[]")
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
    sugestoes_ia_raw: Mapped[str] = mapped_column(Text, default="")
    # F-058: influência manual do editor sobre a thumbnail. Texto livre
    # (pessoas a destacar, relações, ênfases de tema). Quando preenchido, é
    # anexado ao prompt da skill `thumbnail-prompt-expert` como direção
    # prioritária, somando-se ao raciocínio do capista. Vazio = comportamento
    # idêntico ao atual.
    hints_thumbnail: Mapped[str] = mapped_column(Text, default="")
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
    shorts: Mapped[list["Short"]] = relationship(
        "Short", back_populates="corte", cascade="all, delete-orphan"
    )


class Short(Base):
    __tablename__ = "shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"))
    numero: Mapped[int] = mapped_column(Integer)
    titulo_sugerido: Mapped[str] = mapped_column(String(500), default="")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    cenas_remotion: Mapped[str] = mapped_column(Text, default="[]")
    desvios: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(50), default=StatusShort.SUGERIDO)
    arquivo_short_path: Mapped[str] = mapped_column(String(1000), default="")
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
    __tablename__ = "metadados_shorts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    short_id: Mapped[str] = mapped_column(String(36), ForeignKey("shorts.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")
    frase_capa: Mapped[str] = mapped_column(String(100), default="")
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
    is_fire: Mapped[bool] = mapped_column(Integer, default=0)
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

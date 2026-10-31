"""Dados do canal: stats do YouTube, preset de layout, avaliações e lives candidatas."""

from datetime import datetime

from app.models.base import Base, StatusLiveCandidata
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


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
    Vocabulário e validação em `domain/corte/avaliacao_bruto.py`.
    """

    __tablename__ = "avaliacoes_bruto"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), index=True)
    projeto_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    # Nota 1-5, a escala que o voto humano por corte (D-419) usava.
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

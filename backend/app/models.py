"""
Modelos SQLAlchemy para o CortadorLive
"""

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from datetime import datetime
import enum


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


class Projeto(Base):
    __tablename__ = "projetos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    youtube_url: Mapped[str] = mapped_column(String(500))
    titulo_live: Mapped[str] = mapped_column(String(500), default="")
    canal_origem: Mapped[str] = mapped_column(String(200), default="@ateuinforma")
    duracao_segundos: Mapped[int] = mapped_column(Integer, default=0)
    data_live: Mapped[str] = mapped_column(String(20), default="")
    arquivo_video_path: Mapped[str] = mapped_column(String(1000), default="")
    transcricao_raw: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(50), default=StatusProjeto.PENDENTE)
    progresso_download: Mapped[float] = mapped_column(Float, default=0.0)
    erro_msg: Mapped[str] = mapped_column(Text, default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cortes: Mapped[list["Corte"]] = relationship("Corte", back_populates="projeto", cascade="all, delete-orphan")


class Corte(Base):
    __tablename__ = "cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    projeto_id: Mapped[str] = mapped_column(String(36), ForeignKey("projetos.id"))
    numero: Mapped[int] = mapped_column(Integer)
    titulo_proposto: Mapped[str] = mapped_column(String(500), default="")
    resumo: Mapped[str] = mapped_column(Text, default="")
    tema_central: Mapped[str] = mapped_column(String(500), default="")
    inicio_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    fim_hms: Mapped[str] = mapped_column(String(20), default="00:00:00")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    desvios: Mapped[str] = mapped_column(Text, default="[]")  # JSON serializado
    status: Mapped[str] = mapped_column(String(50), default=StatusCorte.PROPOSTO)
    arquivo_clip_path: Mapped[str] = mapped_column(String(1000), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projeto: Mapped["Projeto"] = relationship("Projeto", back_populates="cortes")
    metadado: Mapped["MetadadoCorte"] = relationship("MetadadoCorte", back_populates="corte", uselist=False, cascade="all, delete-orphan")


class MetadadoCorte(Base):
    __tablename__ = "metadados_cortes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), ForeignKey("cortes.id"), unique=True)
    titulo_youtube: Mapped[str] = mapped_column(String(100), default="")
    descricao_youtube: Mapped[str] = mapped_column(Text, default="")
    tags_youtube: Mapped[str] = mapped_column(Text, default="[]")  # JSON serializado
    opcoes_titulo: Mapped[str] = mapped_column(Text, default="[]")  # JSON serializado
    opcoes_texto_capa: Mapped[str] = mapped_column(Text, default="[]")  # JSON serializado
    texto_capa: Mapped[str] = mapped_column(String(100), default="")
    link_live_com_timestamp: Mapped[str] = mapped_column(String(500), default="")
    canal_credito: Mapped[str] = mapped_column(String(200), default="@ateuinforma")
    prompt_thumbnail: Mapped[str] = mapped_column(Text, default="")
    thumbnail_path: Mapped[str] = mapped_column(String(1000), default="")
    numero_serie: Mapped[int] = mapped_column(Integer, default=1)
    cor_serie: Mapped[str] = mapped_column(String(100), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    corte: Mapped["Corte"] = relationship("Corte", back_populates="metadado")

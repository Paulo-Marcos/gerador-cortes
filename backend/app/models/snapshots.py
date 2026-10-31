"""Fotos congeladas do que a IA propôs (hoje: o corte)."""

from datetime import datetime

from app.models.base import Base
from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class CorteSnapshot(Base):
    """D-303: snapshot imutável da proposta da IA no momento da importação.

    Congela a proposta ANTES da edição humana e nunca muda: é a régua proposta×
    final da telemetria. Corte sem snapshot foi criado na mão ou é anterior a ela.
    D-993: sobrevive ao corte. Apagar o corte grava `apagado_em` e o motivo
    (`domain/corte/motivo_apagado.py`); `corte_id` não é FK (migration 009),
    porque a linha guarda o id de um corte que pode não existir mais.
    """

    __tablename__ = "corte_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    corte_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    projeto_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    apagado_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    motivo_apagado: Mapped[str] = mapped_column(String(30), default="")
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
    # Quem propôs o corte: o provider da análise ("claude", "gemini") ou "manual".
    origem_analise: Mapped[str] = mapped_column(String(30), default="claude")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

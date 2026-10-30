"""D-995: a proposta original de cada short, congelada no nascimento.

Na infraestrutura, e não como mais uma classe em `models.py`: aquele arquivo
está no teto da catraca de tamanho (D-771), e a raiz de `app/` não aceita módulo
novo (D-698). É o banco, e o banco é mundo externo. `app.migrations` o importa,
então a tabela entra no `create_all` do boot como qualquer outra.
"""

from datetime import datetime

from app.models import Base
from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class ShortSnapshot(Base):
    """O que a IA propôs para UM short, antes da mão do operador, e que não muda.

    É o `CorteSnapshot` (D-303) do short. Na D-989, as bordas e o score do
    shorts-expert só saíram do `llm_calls`, casando título — foi assim que se viu
    o operador esticar 43 de 65 shorts aceitos. Agora a régua proposta×final é
    esta linha (`domain/short/telemetria_shorts.py`).

    Sobrevive ao short, na forma que a D-993 deu ao snapshot do corte: `short_id`
    e `corte_id` não são FK, e apagar o corte (que leva os shorts no cascade)
    grava `apagado_em`. `corte_id` é o corte em que o short NASCEU: juntar cortes
    move o short, não a origem da proposta.
    """

    __tablename__ = "short_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    short_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    corte_id: Mapped[str] = mapped_column(String(36), index=True)
    projeto_id: Mapped[str] = mapped_column(String(36), index=True)
    apagado_em: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    numero: Mapped[int] = mapped_column(Integer, default=0)
    titulo_sugerido: Mapped[str] = mapped_column(String(500), default="")
    gancho: Mapped[str] = mapped_column(Text, default="")
    inicio_seg: Mapped[float] = mapped_column(Float, default=0.0)
    fim_seg: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    # Quem propôs: o provider ("claude", "gemini") e o modelo que ATENDEU a chamada.
    provedor: Mapped[str] = mapped_column(String(30), default="")
    modelo: Mapped[str] = mapped_column(String(100), default="")
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

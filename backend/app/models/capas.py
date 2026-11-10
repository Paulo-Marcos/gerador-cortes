"""O último pedido de cada capa ao robô do ChatGPT (D-1100)."""

from datetime import datetime

from app.models.base import Base
from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class UltimoPedidoDeCapa(Base):
    """Em que passo parou o último pedido desta capa, e por quê.

    A fila de verdade continua na memória do backend (`services/pedidos_capa_chatgpt`):
    é ela que organiza a vez do robô. Esta tabela é o rastro que sobrevive ao
    reinício. Sem ela, a recusa do ChatGPT sumia junto com o processo, e a
    capa vertical ficava faltando sem explicação na tela, com a RN-26 segurando
    a publicação. Uma linha por capa: o pedido novo apaga o anterior, como na fila.
    """

    __tablename__ = "pedidos_capa_chatgpt"

    # youtube | tiktok | short: a capa é o par (destino, alvo).
    destino: Mapped[str] = mapped_column(String(20), primary_key=True)
    # O corte (youtube, tiktok) ou o short que recebe a imagem.
    alvo_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    pedido_id: Mapped[str] = mapped_column(String(36), default="")
    corte_id: Mapped[str] = mapped_column(String(36), default="", index=True)
    estado: Mapped[str] = mapped_column(String(20), default="aguardando")
    etapa: Mapped[str] = mapped_column(String(200), default="")
    erro: Mapped[str] = mapped_column(Text, default="")
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

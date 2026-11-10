"""As junções que o "Juntar com o próximo" recusa (D-575, D-1097, RN-04).

Saiu de `services/corte.py` com a D-1097, que acrescentou o corte riscado à
lista: o juntar passou a riscar o segundo corte em vez de apagá-lo.
"""

from __future__ import annotations

from app.domain.corte import ciclo_corte
from app.models import Corte, StatusCorte
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def recusar_juncao_invalida(db: AsyncSession, primeiro: Corte, segundo: Corte) -> None:
    """Barra as junções que produziriam um corte incoerente (D-575).

    Levanta ValueError com a razão; o router traduz para 400.

    - **Projetos diferentes**: os tempos medem lives distintas; somar não
      significa nada.
    - **Já publicado**: juntar reescreveria um vídeo que está no ar.
    - **Corte no meio**: o vão entre os dois vira trecho removido, e esse vão
      engoliria inteiro o corte do meio — que continuaria existindo, agora
      sobreposto ao mesclado. O riscado não conta: ele não vai para o vídeo (D-1097).
    - **Riscado**: juntar é para dois cortes que ficam; o riscado volta antes.
    """
    if primeiro.projeto_id != segundo.projeto_id:
        raise ValueError("Só dá para juntar cortes do mesmo projeto.")
    if any(_esta_riscado(c) for c in (primeiro, segundo)):
        raise ValueError("Um corte riscado não se junta: traga-o de volta antes.")

    publicado = next((c for c in (primeiro, segundo) if (c.youtube_video_id or "").strip()), None)
    if publicado is not None:
        raise ValueError(
            f"O corte #{publicado.numero} já foi publicado no YouTube; "
            "juntar mudaria um vídeo que já está no ar."
        )

    entre = await db.execute(
        select(func.count())
        .select_from(Corte)
        .where(
            Corte.projeto_id == primeiro.projeto_id,
            Corte.id.notin_([primeiro.id, segundo.id]),
            Corte.status != StatusCorte.REJEITADO,
            Corte.inicio_seg >= float(primeiro.fim_seg or 0.0),
            Corte.inicio_seg < float(segundo.inicio_seg or 0.0),
        )
    )
    if entre.scalar_one() > 0:
        raise ValueError("Há outro corte entre os dois. Junte primeiro os vizinhos imediatos.")


def _esta_riscado(corte: Corte) -> bool:
    return getattr(corte.status, "value", corte.status) == ciclo_corte.REJEITADO

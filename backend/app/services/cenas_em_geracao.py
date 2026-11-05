"""Quem está gerando as cenas de cada corte agora (D-1037).

A mesma geração tem duas origens: o clique na Pós e a cadeia que o bruto encadeia.
Sem esta marca, as duas rodavam juntas e o corte pagava duas vezes (US$ 0,33 e
256 s na mediana), com a última a terminar sobrescrevendo a outra.

Em memória, como o `BrutoProgress`: quem gera é este processo, então a marca morre
com ele e um reinício nunca deixa corte preso. Cada reserva tem um dono: soltar
duas vezes não solta a de quem veio depois, e é por isso que a cadeia pode segurá-la
até o fim sem saber que a geração já a soltou.
"""

from __future__ import annotations

from app.domain.compartilhado.erros import PedidoInvalido

_em_curso: dict[str, ReservaDeCenas] = {}


class ReservaDeCenas:
    """O direito de gerar as cenas de um corte. Solta ao sair do `with`."""

    def __init__(self, corte_id: str) -> None:
        self.corte_id = corte_id

    def liberar(self) -> None:
        if _em_curso.get(self.corte_id) is self:
            del _em_curso[self.corte_id]

    def __enter__(self) -> ReservaDeCenas:
        return self

    def __exit__(self, *_erro: object) -> None:
        self.liberar()


def reservar(corte_id: str) -> ReservaDeCenas | None:
    """A reserva, ou `None` se já há geração. O `setdefault` decide num passo só."""
    nova = ReservaDeCenas(corte_id)
    return nova if _em_curso.setdefault(corte_id, nova) is nova else None


def reservar_ou_recusar(corte_id: str) -> ReservaDeCenas:
    reserva = reservar(corte_id)
    if reserva is None:
        raise PedidoInvalido(
            "As cenas deste corte já estão sendo geradas. Espere terminar para pedir de novo."
        )
    return reserva


def em_geracao(corte_id: str) -> bool:
    return corte_id in _em_curso

"""Quem está gerando o quê de cada corte agora (D-1037, D-1043).

Cada geração paga tem a própria marca, porque um corte gera cenas e metadados ao mesmo
tempo: o gesto do bruto pede os dois, e uma marca só faria um recusar o outro.

Em memória, como o `BrutoProgress`: quem gera é este processo, então a marca morre
com ele e um reinício nunca deixa corte preso. Cada reserva tem um dono: soltar
duas vezes não solta a de quem veio depois.
"""

from __future__ import annotations

from app.domain.compartilhado.erros import PedidoInvalido


class ReservaDeGeracao:
    """O direito de gerar, para um corte. Solta ao sair do `with`."""

    def __init__(self, marca: MarcaDeGeracao, corte_id: str) -> None:
        self._marca = marca
        self.corte_id = corte_id

    def liberar(self) -> None:
        self._marca.soltar(self)

    def __enter__(self) -> ReservaDeGeracao:
        return self

    def __exit__(self, *_erro: object) -> None:
        self.liberar()


class MarcaDeGeracao:
    def __init__(self, recusa: str) -> None:
        self._recusa = recusa
        self._em_curso: dict[str, ReservaDeGeracao] = {}

    def reservar(self, corte_id: str) -> ReservaDeGeracao | None:
        """A reserva, ou `None` se já há geração. O `setdefault` decide num passo só."""
        nova = ReservaDeGeracao(self, corte_id)
        return nova if self._em_curso.setdefault(corte_id, nova) is nova else None

    def reservar_ou_recusar(self, corte_id: str) -> ReservaDeGeracao:
        reserva = self.reservar(corte_id)
        if reserva is None:
            raise PedidoInvalido(self._recusa)
        return reserva

    def esta_gerando(self, corte_id: str) -> bool:
        return corte_id in self._em_curso

    def soltar(self, reserva: ReservaDeGeracao) -> None:
        if self._em_curso.get(reserva.corte_id) is reserva:
            del self._em_curso[reserva.corte_id]

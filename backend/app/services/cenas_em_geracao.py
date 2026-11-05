"""Quem está gerando as cenas de cada corte agora, e quem as faz esperar (D-1037).

A mesma geração tem duas origens: o clique na Pós e a cadeia que o bruto encadeia.
Sem esta marca, as duas rodavam juntas e o corte pagava duas vezes (US$ 0,33 e
256 s na mediana), com a última a terminar sobrescrevendo a outra.

D-1048: o bruto que não vai gerar cenas também segura a marca, porque a salvaguarda
reescreve a transcrição que elas leriam. Só que nenhuma cena está sendo gerada ali,
e `esta_gerando`, que a tela lê, continua dizendo a verdade.

Em memória, como o `BrutoProgress`: quem gera é este processo, então a marca morre
com ele e um reinício nunca deixa corte preso. Cada reserva tem um dono: soltar
duas vezes não solta a de quem veio depois, e é por isso que a cadeia pode segurá-la
até o fim sem saber que a geração já a soltou.
"""

from __future__ import annotations

from app.domain.compartilhado.erros import PedidoInvalido

_em_curso: dict[str, ReservaDeCenas] = {}

BRUTO_ESPERA_AS_CENAS = (
    "As cenas deste corte estão sendo geradas. Espere terminar para gerar o bruto: ele pode "
    "mudar a transcrição, e as cenas sairiam fora do tempo."
)
BRUTO_ESPERA_O_BRUTO = "O bruto deste corte já está sendo gerado. Espere terminar para pedir outro."
CENAS_ESPERAM_O_BRUTO = (
    "O bruto deste corte está sendo gerado. Espere terminar para pedir as cenas."
)


class ReservaDeCenas:
    """O direito de gerar as cenas de um corte, ou de impedir que gerem. Solta ao sair do `with`."""

    def __init__(self, corte_id: str, *, gera_cenas: bool = True) -> None:
        self.corte_id = corte_id
        self.gera_cenas = gera_cenas

    def liberar(self) -> None:
        if _em_curso.get(self.corte_id) is self:
            del _em_curso[self.corte_id]

    def __enter__(self) -> ReservaDeCenas:
        return self

    def __exit__(self, *_erro: object) -> None:
        self.liberar()


def reservar(corte_id: str, *, gera_cenas: bool = True) -> ReservaDeCenas | None:
    """A reserva, ou `None` se a marca tem dono. O `setdefault` decide num passo só."""
    nova = ReservaDeCenas(corte_id, gera_cenas=gera_cenas)
    return nova if _em_curso.setdefault(corte_id, nova) is nova else None


def reservar_ou_recusar(corte_id: str) -> ReservaDeCenas:
    reserva = reservar(corte_id)
    if reserva is None:
        if not esta_gerando(corte_id):
            raise PedidoInvalido(CENAS_ESPERAM_O_BRUTO)
        raise PedidoInvalido(
            "As cenas deste corte já estão sendo geradas. Espere terminar para pedir de novo."
        )
    return reserva


def esta_gerando(corte_id: str) -> bool:
    """Se há cenas sendo geradas: é o que a tela mostra. O bruto que só espera não conta."""
    reserva = _em_curso.get(corte_id)
    return reserva is not None and reserva.gera_cenas


def recusa_ao_bruto(corte_id: str) -> str | None:
    """Por que um bruto novo não pode começar agora, ou `None` se ele pode."""
    if corte_id not in _em_curso:
        return None
    return BRUTO_ESPERA_AS_CENAS if esta_gerando(corte_id) else BRUTO_ESPERA_O_BRUTO

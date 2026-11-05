"""Quem está gerando as cenas de cada corte agora, e quem as faz esperar (D-1037).

A mesma geração tem duas origens: o clique na Pós e a cadeia que o bruto encadeia.
Sem esta marca, as duas rodavam juntas e o corte pagava duas vezes (US$ 0,33 e
256 s na mediana), com a última a terminar sobrescrevendo a outra. A cadeia pode
segurar a reserva até o fim sem saber que a geração já a soltou: cada uma tem um dono.

D-1048: o bruto que não vai gerar cenas também segura a marca, porque a salvaguarda
reescreve a transcrição que elas leriam. Só que nenhuma cena está sendo gerada ali,
e `esta_gerando`, que a tela lê, continua dizendo a verdade.
"""

from __future__ import annotations

from app.domain.compartilhado.erros import PedidoInvalido
from app.services.marca_de_geracao import MarcaDeGeracao, ReservaDeGeracao

BRUTO_ESPERA_AS_CENAS = (
    "As cenas deste corte estão sendo geradas. Espere terminar para gerar o bruto."
)
BRUTO_ESPERA_O_BRUTO = "O bruto deste corte já está sendo gerado. Espere terminar para pedir outro."
CENAS_ESPERAM_O_BRUTO = (
    "O bruto deste corte está sendo gerado. Espere terminar para pedir as cenas."
)
DIVIDIR_E_JUNTAR_ESPERAM_AS_CENAS = (
    "As cenas deste corte estão sendo geradas. Espere terminar para dividir ou juntar: "
    "a resposta da IA voltaria para um corte que já não é o mesmo."
)


class ReservaDeCenas(ReservaDeGeracao):
    """A reserva das cenas. Com `gera_cenas` falso, é o bruto que só as faz esperar."""

    def __init__(self, marca: MarcaDeGeracao, corte_id: str, *, gera_cenas: bool = True) -> None:
        super().__init__(marca, corte_id)
        self.gera_cenas = gera_cenas


class _MarcaDasCenas(MarcaDeGeracao):
    def reservar(self, corte_id: str, *, gera_cenas: bool = True) -> ReservaDeCenas | None:
        nova = ReservaDeCenas(self, corte_id, gera_cenas=gera_cenas)
        return nova if self._em_curso.setdefault(corte_id, nova) is nova else None

    def reservar_ou_recusar(self, corte_id: str) -> ReservaDeGeracao:
        if corte_id in self._em_curso and not self.esta_gerando(corte_id):
            raise PedidoInvalido(CENAS_ESPERAM_O_BRUTO)
        return super().reservar_ou_recusar(corte_id)

    def esta_gerando(self, corte_id: str) -> bool:
        """Se há cenas sendo geradas: é o que a tela mostra. O bruto que só espera não conta."""
        reserva = self._em_curso.get(corte_id)
        return isinstance(reserva, ReservaDeCenas) and reserva.gera_cenas

    def recusa_ao_bruto(self, corte_id: str) -> str | None:
        """Por que um bruto novo não pode começar agora, ou `None` se ele pode."""
        if corte_id not in self._em_curso:
            return None
        return BRUTO_ESPERA_AS_CENAS if self.esta_gerando(corte_id) else BRUTO_ESPERA_O_BRUTO


_marca = _MarcaDasCenas(
    "As cenas deste corte já estão sendo geradas. Espere terminar para pedir de novo."
)

reservar = _marca.reservar
reservar_ou_recusar = _marca.reservar_ou_recusar
esta_gerando = _marca.esta_gerando
recusa_ao_bruto = _marca.recusa_ao_bruto


def recusar_dividir_ou_juntar(*cortes_ids: str) -> None:
    """Dividir e juntar mudam qual corte existe: a exceção a levar as cenas junto (D-1049).

    Trecho e borda, a cena acompanha (RN-36). Aqui parte dela iria para outro corte, e o
    absorvido deixa de existir antes de a resposta da IA chegar.
    """
    if any(esta_gerando(corte_id) for corte_id in cortes_ids):
        raise PedidoInvalido(DIVIDIR_E_JUNTAR_ESPERAM_AS_CENAS)

"""Quem está gerando as cenas de cada corte agora (D-1037).

A mesma geração tem duas origens: o clique na Pós e a cadeia que o bruto encadeia.
Sem esta marca, as duas rodavam juntas e o corte pagava duas vezes (US$ 0,33 e
256 s na mediana), com a última a terminar sobrescrevendo a outra. A cadeia pode
segurar a reserva até o fim sem saber que a geração já a soltou: cada uma tem um dono.
"""

from __future__ import annotations

from app.services.marca_de_geracao import MarcaDeGeracao, ReservaDeGeracao

_marca = MarcaDeGeracao(
    "As cenas deste corte já estão sendo geradas. Espere terminar para pedir de novo."
)

BRUTO_ESPERA_AS_CENAS = (
    "As cenas deste corte estão sendo geradas. Espere terminar para gerar o bruto: ele pode "
    "mudar a transcrição, e as cenas sairiam fora do tempo."
)

ReservaDeCenas = ReservaDeGeracao
reservar = _marca.reservar
reservar_ou_recusar = _marca.reservar_ou_recusar
esta_gerando = _marca.esta_gerando

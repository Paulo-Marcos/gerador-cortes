"""Quais cortes estão com os metadados sendo gerados agora (D-1043).

Um F5 apaga o estado da tela, e a geração segue em voo. Sem esta marca, um novo
clique pagava outra chamada (US$ 0,23 e 89 s na mediana), e a última a terminar
ainda gravava por cima da primeira.
"""

from __future__ import annotations

from app.services.marca_de_geracao import MarcaDeGeracao

_marca = MarcaDeGeracao(
    "Os metadados deste corte já estão sendo gerados. Espere terminar para pedir de novo."
)

reservar_ou_recusar = _marca.reservar_ou_recusar

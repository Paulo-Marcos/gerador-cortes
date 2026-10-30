"""D-997: a faixa de duração do short só aceita número finito de segundos.

O Pydantic aceita NaN e inf em `float`, e NaN passa por qualquer comparação:
sem esta guarda, `{"duracao_min_seg": NaN}` seria gravado como a faixa do canal.
"""

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.short.shorts import faixa_de_duracao_valida


@pytest.mark.parametrize(("minimo", "maximo"), [(float("nan"), 90), (15, float("inf"))])
def test_valor_que_nao_e_numero_finito_e_recusado(minimo, maximo):
    with pytest.raises(PedidoInvalido, match="número de segundos"):
        faixa_de_duracao_valida(minimo, maximo)

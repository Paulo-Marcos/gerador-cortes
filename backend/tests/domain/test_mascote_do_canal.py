"""As regras da Mascote do Canal, no domínio (D-762).

Antes testadas só através do banco de settings e do `mascote.yaml`
(`tests/test_editorial_identity.py`); aqui, como regras: nome vazio vale a
mascote neutra, e a neutra não é um nome que o operador escolheu.
"""

import pytest
from app.domain.canal.mascote import MASCOTE_NEUTRO, Mascote, mascote_de, nome_definido


def test_nome_vira_mascote_sem_espacos_nas_pontas():
    assert mascote_de("  Rã ") == Mascote(nome="Rã")


@pytest.mark.parametrize("vazio", [None, "", "   "])
def test_sem_nome_vale_a_mascote_neutra(vazio):
    assert mascote_de(vazio) == MASCOTE_NEUTRO


def test_a_neutra_nao_e_um_nome_definido():
    assert nome_definido(MASCOTE_NEUTRO) == ""
    assert nome_definido(Mascote(nome="Sapo")) == "Sapo"

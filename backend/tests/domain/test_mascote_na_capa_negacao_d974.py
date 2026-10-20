"""D-974, reauditoria do PR #240: proibir o mascote não pode esconder o mascote descrito.

Para não reprovar prompts limpos, a trava ignora a lista do que evitar e as
negações ("no frog"). A primeira correção alargou essas duas borrachas: elas
apagavam até o fim da linha ou da oração e levavam junto o mascote que vinha
depois. Cada caso abaixo foi medido na auditoria e descreve o Sapo.
"""

import pytest
from app.domain.canal.protagonista_da_capa import mascote_descrito


@pytest.mark.parametrize(
    "prompt",
    [
        "No watermark, the frog stands behind the host.",
        "Host with no tie and the Sapo frog standing behind his shoulder.",
        "Leave no empty space around the frog mascot behind the host.",
        "Negative space on the left for the text, the Sapo frog behind his shoulder.",
        "Host centered to avoid overlap with the UI; SECOND FIGURE: the Sapo, a frog.",
        "Avoid: watermark. Vertical 9:16, host chest-up, the Sapo frog behind him.",
    ],
)
def test_a_negacao_e_a_lista_nao_engolem_o_mascote_descrito(prompt):
    assert "frog" in mascote_descrito(prompt, mascote="Sapo")

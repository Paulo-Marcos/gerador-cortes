"""D-974, terceira rodada da auditoria do PR #240: coordenação e "don't" na negação.

A segunda correção estreitou a negação para não engolir o mascote descrito
depois dela, e passou do ponto: listas naturais de proibição voltaram a
reprovar um prompt limpo. Vírgula e barra coordenam termos colados; "or" e
"and" admitem até duas palavras antes do termo ("or any cartoon frog").
"""

import pytest
from app.domain.canal.protagonista_da_capa import mascote_descrito


@pytest.mark.parametrize(
    "prompt",
    [
        "Host alone. Absolutely no Sapo, frog or mascot.",
        "Host alone, no frog, mascot or cartoon animal.",
        "Host alone, no Sapo or any cartoon frog.",
        "Host alone, no frog and mascot.",
        "Host alone (no frog/mascot).",
        "Host alone. Don't include the frog.",
    ],
)
def test_listas_naturais_de_proibicao_passam(prompt):
    assert mascote_descrito(prompt, mascote="Sapo") == []


@pytest.mark.parametrize(
    "prompt",
    [
        # A vírgula só coordena termo colado: aqui ela abre outra oração.
        "No frog, the Sapo stands behind the host.",
        # Itens na linha do cabeçalho: os bullets de baixo não são a lista.
        "AVOID: watermark\n- SECOND FIGURE: the Sapo, an anthropomorphic frog",
    ],
)
def test_o_mascote_descrito_depois_continua_pego(prompt):
    assert "sapo" in mascote_descrito(prompt, mascote="Sapo")

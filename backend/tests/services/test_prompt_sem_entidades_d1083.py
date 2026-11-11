"""D-1083: a transcrição escapada do VTT chega limpa onde vira prompt da IA.

A análise da live (gerar cortes) e o plano de cenas preparam a transcrição pela
`limpar_e_ordenar_transcricao`, que agora decodifica as entidades: um projeto antigo,
com `[&nbsp;__&nbsp;]` gravado, manda `[ __ ]` para a IA sem regravar o banco.
"""

from app.services.cenas_remotion import CenasRemotionService
from app.services.claude_ia import ClaudeIaService

_ESCAPADA = [
    {"start": 10.0, "end": 12.0, "texto": "não é [&nbsp;__&nbsp;] velho"},
    {"start": 12.0, "end": 14.0, "texto": "&gt;&gt; P&amp;D"},
]


def test_prompt_da_analise_da_live_recebe_o_texto_limpo():
    segmentos = ClaudeIaService._granularizar(_ESCAPADA)
    prompt = ClaudeIaService._formatar_segmentos(segmentos, None)

    assert "[ __ ]" in prompt
    assert ">> P&D" in prompt
    assert "&nbsp;" not in prompt
    assert "&gt;" not in prompt


def test_transcricao_do_plano_de_cenas_chega_limpa():
    textos = [seg["texto"] for seg in CenasRemotionService._get_granular(_ESCAPADA)]

    assert " ".join(textos) == "não é [ __ ] velho >> P&D"

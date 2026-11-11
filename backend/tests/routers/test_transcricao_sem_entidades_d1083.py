"""D-1083: a transcrição gravada escapada em HTML sai limpa na API.

Projetos ingeridos pelo VTT antes da correção têm `[&nbsp;__&nbsp;]` gravado. A
API decodifica ao serializar o corte, sem regravar o banco, e a fala do trecho e a
aba Transcrição recebem `[ __ ]`.
"""

import json

from app.models import Corte
from app.routers.cortes_helpers import _corte_to_dict

_ESCAPADA = [{"start": 10.0, "end": 14.0, "texto": "não é [&nbsp;__&nbsp;] velho &gt;&gt; P&amp;D"}]
_LIMPA = "não é [ __ ] velho >> P&D"


def _corte_gravado() -> Corte:
    return Corte(
        id="c1",
        projeto_id="p1",
        numero=1,
        inicio_seg=0.0,
        fim_seg=60.0,
        transcricao_corte=json.dumps(_ESCAPADA, ensure_ascii=False),
        transcricao_final=json.dumps(_ESCAPADA, ensure_ascii=False),
    )


def test_transcricao_do_corte_sai_decodificada():
    linhas = _corte_to_dict(_corte_gravado())["transcricao_corte"]

    assert [linha["texto"] for linha in linhas] == [_LIMPA]
    assert linhas[0]["start"] == 10.0


def test_transcricao_final_sai_decodificada():
    linhas = _corte_to_dict(_corte_gravado())["transcricao_final"]

    assert [linha["texto"] for linha in linhas] == [_LIMPA]

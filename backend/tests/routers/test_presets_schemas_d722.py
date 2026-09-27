"""O preset de layout sai inteiro pelo schema, qualquer que seja o tipo (D-722).

O `payload` muda de forma com o `tipo`; o schema o carrega como objeto livre e
só fixa o vocabulário dos tipos.
"""

from datetime import datetime

import pytest
from app.routers.presets import LayoutPresetResponse
from pydantic import ValidationError

_PAYLOADS = {
    "completo": {"modo": "compartilhada", "fundo": "grafite"},
    "posicionamento": {"compartilhada": {"telas": 2}, "fundo": "grafite"},
    "posicionamento_full": {"full": {"crop": {}, "slot": {}}},
    "palco_short": {"arranjo": "empilhado", "recortes": {}, "ajustes": {}},
    "gancho_short": {"cor": "", "realce": "veu", "tamanho": 0},
}


def _preset(tipo: str) -> dict:
    return {
        "id": "p1",
        "nome": "Meu preset",
        "tipo": tipo,
        "payload": _PAYLOADS[tipo],
        "criado_em": datetime(2026, 9, 1, 12, 0),
        "atualizado_em": datetime(2026, 9, 2, 12, 0),
    }


@pytest.mark.parametrize("tipo", sorted(_PAYLOADS))
def test_o_preset_de_cada_tipo_passa_inteiro(tipo):
    preset = _preset(tipo)

    assert LayoutPresetResponse.model_validate(preset).model_dump() == preset


def test_tipo_fora_do_catalogo_e_recusado():
    with pytest.raises(ValidationError):
        LayoutPresetResponse.model_validate(_preset("completo") | {"tipo": "retrato"})

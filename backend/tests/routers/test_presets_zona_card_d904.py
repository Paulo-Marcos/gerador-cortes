"""O preset de posicionamento guarda a zona dos cards so quando ela veio (D-904).

RN-10 vale no preset como no corte: a chave ausente e a regra automatica, e
normalizar o payload nao pode inventa-la.
"""

from app.routers.presets import _normalizar_payload

ZONA = {"x": 1400, "y": 200, "w": 440, "h": 600}


def test_preset_sem_zona_nao_a_materializa():
    normalizado = _normalizar_payload("posicionamento", {"compartilhada": {"telas": 2}})
    assert "zona_card" not in normalizado["compartilhada"]


def test_preset_com_zona_a_guarda_normalizada():
    normalizado = _normalizar_payload(
        "posicionamento", {"compartilhada": {"telas": 2, "zona_card": dict(ZONA)}}
    )
    assert normalizado["compartilhada"]["zona_card"] == ZONA


def test_preset_completo_leva_a_zona_pelo_layout_inteiro():
    normalizado = _normalizar_payload("completo", {"compartilhada": {"zona_card": dict(ZONA)}})
    assert normalizado["compartilhada"]["zona_card"] == ZONA

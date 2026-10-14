"""D-913: o props.json da camada do short leva o estilo da legenda do canal."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from app.services.render import camada_short


@pytest.mark.parametrize("estilo", ["contorno", "sombra"])
def test_props_da_camada_levam_o_estilo_da_legenda(monkeypatch, estilo):
    monkeypatch.setattr(
        camada_short.palco_componentes, "ler", lambda: SimpleNamespace(estilo_da_legenda=estilo)
    )
    contexto = SimpleNamespace(
        cenas=[],
        gancho=None,
        legenda_cor="#fff",
        legenda_fonte="",
        legenda_lugar={"x": 50, "y": 82, "largura": 80},
        duracao_seg=30.0,
    )
    props = camada_short.props_da_camada(contexto, captions=[{"text": "oi"}])
    assert props["legendaEstilo"] == estilo
    assert props["captions"] == [{"text": "oi"}]
    assert props["legendaLugar"] == {"x": 50, "y": 82, "largura": 80}
    assert props["duracaoSeg"] == 30.0

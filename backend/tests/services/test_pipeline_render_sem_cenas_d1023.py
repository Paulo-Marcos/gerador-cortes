"""REGRESSAO D-1023: corte sem cenas caia num fallback que chamava
`CorteService.obter_corte` (inexistente) e falhava com AttributeError.
O corte do render já vem do banco: sem cenas, segue sem overlays.
"""

import asyncio
import json

import pytest


@pytest.mark.parametrize("cenas_remotion", [None, "", json.dumps({"cenas": []})])
def test_corte_sem_cenas_nao_gera_chunks(cenas_remotion):
    from app.services.render.pipeline_render import _preparar_overlay_chunks

    corte = {"id": "corte-d1023", "cenas_remotion": cenas_remotion}

    assert asyncio.run(_preparar_overlay_chunks(corte, "vertical")) == []

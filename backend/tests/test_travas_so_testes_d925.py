"""D-925: o registro de travas versionado trava só os testes.

Os testes são o contrato do comportamento: alterar, apagar ou renomear um
teste exige autorização do dono; criar teste novo e mexer no código é livre.
Lê o `registry.yaml` de verdade pelo próprio `bin/check-lock.py` — o mesmo
que o CI e o hook usam —, para o padrão escrito não divergir do que trava.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_RAIZ = Path(__file__).resolve().parents[2]


def _check_lock():
    spec = importlib.util.spec_from_file_location("check_lock", _RAIZ / "bin" / "check-lock.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


TESTES = [
    "backend/tests/test_migrations.py",
    "backend/tests/services/test_palco_por_escopo_d923.py",
    "frontend/src/features/channels/__tests__/PalcoComponentes.test.tsx",
    "frontend/src/features/editor/fase2/relogioDoPlayer.test.tsx",
    "video-renderer/src/cenas-v2/_shared/AutoFitText.test.tsx",
]
CODIGO = [
    "backend/app/main.py",
    "backend/app/services/render/pipeline_render.py",
    "frontend/src/routes.tsx",
    "video-renderer/src/schema.ts",
]


@pytest.mark.parametrize("caminho", TESTES)
@pytest.mark.parametrize("operacao", ["modify", "delete", "rename"])
def test_teste_existente_fica_travado(caminho, operacao):
    assert _check_lock()._blocked([(caminho, operacao)]), caminho


@pytest.mark.parametrize("caminho", CODIGO)
def test_codigo_fica_livre(caminho):
    assert not _check_lock()._blocked([(caminho, "modify")])


def test_criar_teste_novo_e_livre():
    assert not _check_lock()._blocked([("backend/tests/test_novo.py", "add")])

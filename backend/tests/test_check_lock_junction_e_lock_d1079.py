"""D-1079: os dois ramos do `check-lock` que a primeira rodada deixou sem teste.

1. Pasta atual alcançada por junction (Windows) ou symlink: o caminho
   absoluto da pasta atual não fica sob a raiz resolvida até ser resolvido
   também. Sem esse ramo, o `check` recusava um teste travado como "fora do
   repositório".
2. O `lock` resolve o caminho pela pasta atual, como o `check`: de
   `frontend/`, `src/x` grava `frontend/src/x`, e caminho fora do repo é
   recusado sem gravar nada. Roda contra um registry temporário.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

_RAIZ = Path(__file__).resolve().parents[2]
_SCRIPT = _RAIZ / "bin" / "check-lock.py"


def _check_lock():
    spec = importlib.util.spec_from_file_location("check_lock", _SCRIPT)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture
def frontend_por_link(tmp_path):
    """Uma pasta fora do repo que leva a `frontend/`: junction ou symlink."""
    link = tmp_path / "frontend-por-link"
    alvo = _RAIZ / "frontend"
    if sys.platform == "win32":
        import _winapi

        _winapi.CreateJunction(str(alvo), str(link))
    else:
        os.symlink(alvo, link, target_is_directory=True)
    try:
        yield link
    finally:
        # Desfaz só o link: apagar a árvore por ele apagaria o frontend.
        if sys.platform == "win32":
            os.rmdir(link)
        else:
            os.unlink(link)


def test_check_de_uma_pasta_alcancada_por_link_trava(frontend_por_link):
    resultado = subprocess.run(
        [
            sys.executable,
            str(_SCRIPT),
            "check",
            "src/shared/qualidade/__tests__/pisoDeFonte.test.ts",
        ],
        cwd=frontend_por_link,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert resultado.returncode == 1, resultado.stderr
    assert "testes-sao-contrato" in resultado.stderr


@pytest.fixture
def registry_temporario(tmp_path, monkeypatch):
    modulo = _check_lock()
    registry = tmp_path / "registry.yaml"
    monkeypatch.setattr(modulo, "REGISTRY", registry)
    monkeypatch.chdir(_RAIZ / "frontend")
    return modulo, registry


def test_lock_de_dentro_do_frontend_grava_o_caminho_da_raiz(registry_temporario):
    modulo, registry = registry_temporario
    assert modulo.main(["lock", "trava-x", "src/routes.tsx"]) == 0
    travas = yaml.safe_load(registry.read_text(encoding="utf-8"))["locks"]
    assert travas[0]["files"] == ["frontend/src/routes.tsx"]


def test_lock_fora_do_repo_e_recusado_sem_gravar(registry_temporario, capsys):
    modulo, registry = registry_temporario
    assert modulo.main(["lock", "trava-y", "../../fora-do-repo/x.py"]) == 2
    assert "fora do repositorio" in capsys.readouterr().err
    assert not registry.exists()

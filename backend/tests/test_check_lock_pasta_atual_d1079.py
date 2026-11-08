"""D-1079: o `check-lock` responde igual de qualquer pasta.

O caminho passado na linha de comando é relativo à pasta de onde se chama,
não à raiz do repositório. De dentro de `frontend/`, `src/.../x.test.ts`
respondia "OK, nenhum travado" para um teste travado — o falso OK que
escondeu três testes travados da main na D-1070. O `_norm` também tirava
*caracteres* do começo (`lstrip("./")`), não o prefixo `./`: `.guia/...`
virava `guia/...` e `../x` virava `x`.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

_RAIZ = Path(__file__).resolve().parents[2]
_SCRIPT = _RAIZ / "bin" / "check-lock.py"
_TESTE_DO_FRONT = "frontend/src/shared/qualidade/__tests__/pisoDeFonte.test.ts"
_TESTE_DO_BACK = "backend/tests/test_migrations.py"


def _check_lock():
    spec = importlib.util.spec_from_file_location("check_lock", _SCRIPT)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _conferir(pasta: Path, *caminhos: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(_SCRIPT), "check", *caminhos],
        cwd=pasta,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )


def _travado(resultado: subprocess.CompletedProcess[str]) -> bool:
    return resultado.returncode == 1 and "testes-sao-contrato" in resultado.stderr


def test_da_raiz_o_teste_do_front_continua_travado():
    assert _travado(_conferir(_RAIZ, _TESTE_DO_FRONT))


def test_de_dentro_do_frontend_o_caminho_relativo_tambem_trava():
    resultado = _conferir(_RAIZ / "frontend", "src/shared/qualidade/__tests__/pisoDeFonte.test.ts")
    assert _travado(resultado), resultado.stdout


def test_de_dentro_do_frontend_subir_para_o_backend_trava():
    assert _travado(_conferir(_RAIZ / "frontend", f"../{_TESTE_DO_BACK}"))


def test_caminho_absoluto_trava_de_qualquer_pasta():
    resultado = _conferir(_RAIZ / "frontend", str(_RAIZ / _TESTE_DO_BACK))
    assert _travado(resultado), resultado.stdout


def test_caminho_fora_do_repo_e_recusado_e_nunca_da_ok():
    resultado = _conferir(_RAIZ / "frontend", f"../../fora-do-repo/{_TESTE_DO_BACK}")
    assert resultado.returncode == 2
    assert "fora do repositorio" in resultado.stderr
    assert "OK" not in resultado.stdout


def test_codigo_continua_livre_de_dentro_da_subpasta():
    resultado = _conferir(_RAIZ / "frontend", "src/routes.tsx")
    assert resultado.returncode == 0
    assert "nenhum travado" in resultado.stdout


@pytest.mark.parametrize(
    ("caminho", "normalizado"),
    [
        (".github/workflows/ci.yml", ".github/workflows/ci.yml"),
        (".guia/reports/r.md", ".guia/reports/r.md"),
        ("./backend/tests/x.py", "backend/tests/x.py"),
        (".\\backend\\tests\\x.py", "backend/tests/x.py"),
    ],
)
def test_norm_tira_so_o_prefixo_ponto_barra(caminho, normalizado):
    assert _check_lock()._norm(caminho) == normalizado


def test_ignorar_relatorio_do_guia_nao_ignora_pasta_sem_ponto():
    modulo = _check_lock()
    assert modulo._is_ignored_path(".guia/reports/r.md")
    assert not modulo._is_ignored_path("guia/reports/r.md")


def test_caminho_vindo_do_git_nao_se_resolve_pela_pasta_atual(tmp_path, monkeypatch):
    # hook e CI recebem do git caminhos já relativos à raiz: a pasta de onde
    # o processo roda não pode deslocá-los.
    alterados = tmp_path / "alterados.txt"
    alterados.write_text(f"M\t{_TESTE_DO_BACK}\n", encoding="utf-8")
    monkeypatch.chdir(_RAIZ / "frontend")
    modulo = _check_lock()
    assert (
        modulo.main(["ci", "--files", str(alterados), "--messages", str(tmp_path / "nada.txt")])
        == 1
    )

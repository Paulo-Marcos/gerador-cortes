"""Testes do guard-rail bin/check_update_safety.py (D-159).

Verifica que o check de "dado de producao versionado" (passo 1, critico):
  - passa (exit 0) quando o indice do git esta limpo;
  - falha (exit != 0) quando um dado de producao simulado aparece versionado
    (ex.: instance/x.db), SEM acusar a pasta de codigo frontend/src/features/projetos/.
"""
import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "bin" / "check_update_safety.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("check_update_safety", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


mod = _load_module()


def test_repo_limpo_passa():
    assert mod.check_no_prod_data_tracked([
        "backend/app/main.py",
        "frontend/src/features/projetos/ProjetosPage.tsx",  # CODIGO, nao dado
        "docs/SETUP.md",
    ]) is True


def test_detecta_db_versionado():
    assert mod.check_no_prod_data_tracked(["instance/channels/canal/projetos.db"]) is False


def test_detecta_midia_em_pasta_projetos():
    assert mod.check_no_prod_data_tracked(["backend/projetos/12/corte.mkv"]) is False


def test_detecta_canal_config_mas_permite_example():
    assert mod.check_no_prod_data_tracked(["backend/app/canal_config.py"]) is False
    assert mod.check_no_prod_data_tracked(["backend/app/canal_config.py.example"]) is True


def test_frontend_projetos_nao_e_falso_positivo():
    files = [f"frontend/src/features/projetos/{n}.tsx" for n in ("ProjetosPage", "index")]
    assert mod.check_no_prod_data_tracked(files) is True


def test_main_exit_diferente_de_zero_com_dado_simulado(monkeypatch):
    """main() deve retornar != 0 quando ls-files inclui um dado de producao."""
    monkeypatch.setattr(mod, "tracked_files", lambda: ["instance/x.db"])
    assert mod.main(["--no-fetch"]) != 0


def test_main_exit_zero_repo_limpo(monkeypatch):
    monkeypatch.setattr(mod, "tracked_files", lambda: ["backend/app/main.py"])
    assert mod.main(["--no-fetch"]) == 0

"""O bin/portao.py roda o portão do AGENTS.md e devolve o código certo (D-1078).

O ship do Guia confia no código de saída deste script para decidir o push. Por
isso o que se testa é a ordem dos passos, que a primeira falha encerra com o
código dela, que nada passa por um shell e que a venv ausente vira mensagem em
vez de cair no Python global. O subprocess é um dublê: o portão de verdade não
roda dentro do pytest.
"""

import importlib.util
import subprocess
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "portao.py"
_spec = importlib.util.spec_from_file_location("portao", _SCRIPT)
portao = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(portao)


def _texto(comando: list[str]) -> str:
    """O comando como no AGENTS.md: o executável sem pasta nem extensão."""
    return " ".join([Path(comando[0]).stem, *comando[1:]])


class SubprocessDuble:
    """Registra cada chamada e responde com o código combinado para o passo."""

    def __init__(self, codigos: dict[str, int] | None = None):
        self.codigos = codigos or {}
        self.chamadas: list[tuple[list[str], dict]] = []

    def __call__(self, comando, **kwargs):
        self.chamadas.append((list(comando), kwargs))
        return subprocess.CompletedProcess(comando, self.codigos.get(_texto(comando), 0))

    def comandos(self) -> list[str]:
        return [_texto(c) for c, _ in self.chamadas]


ORDEM_DO_AGENTS_MD = [
    "ruff check .",
    "ruff format --check .",
    "lint-imports",
    "python -m pytest -m not integration -n 6",
    "npm run lint",
    "npx tsc --noEmit",
    "npx vitest run",
    "npm run build",
]


@pytest.fixture
def raiz(tmp_path, monkeypatch):
    scripts = tmp_path / "backend" / ".venv" / "Scripts"
    scripts.mkdir(parents=True)
    (scripts / "python.exe").write_text("")
    (tmp_path / "frontend").mkdir()
    monkeypatch.setattr(portao.shutil, "which", lambda nome: f"C:/node/{nome}.cmd")
    return tmp_path


def test_roda_os_oito_passos_na_ordem_do_agents_md(raiz, monkeypatch):
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)

    assert portao.rodar_portao(raiz) == 0
    assert duble.comandos() == ORDEM_DO_AGENTS_MD


def test_backend_roda_pela_venv_e_frontend_pela_pasta_dele(raiz, monkeypatch):
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)

    portao.rodar_portao(raiz)

    scripts = raiz / "backend" / ".venv" / "Scripts"
    backend, frontend = duble.chamadas[:4], duble.chamadas[4:]
    assert all(Path(c[0]).parent == scripts for c, _ in backend)
    assert all(kw["cwd"] == raiz / "backend" for _, kw in backend)
    assert all(kw["cwd"] == raiz / "frontend" for _, kw in frontend)


def test_primeiro_passo_que_falha_encerra_com_o_codigo_dele(raiz, monkeypatch, capsys):
    duble = SubprocessDuble({"lint-imports": 3, "npm run build": 7})
    monkeypatch.setattr(portao.subprocess, "run", duble)

    assert portao.rodar_portao(raiz) == 3
    assert duble.comandos() == ORDEM_DO_AGENTS_MD[:3]
    assert "REPROVADO no passo 3/8 (backend): lint-imports" in capsys.readouterr().out


def test_nenhum_passo_usa_shell_e_todos_tem_timeout(raiz, monkeypatch):
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)

    portao.rodar_portao(raiz)

    assert len(duble.chamadas) == 8
    for _, kwargs in duble.chamadas:
        assert kwargs.get("shell", False) is False
        assert kwargs["timeout"] > 0


def test_npm_e_npx_saem_do_path_resolvidos(raiz, monkeypatch):
    """No Windows o npm é npm.cmd: sem shell, o nome solto não se acha."""
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)

    portao.rodar_portao(raiz)

    frontend = [c[0] for c, _ in duble.chamadas[4:]]
    assert frontend == ["C:/node/npm.cmd", "C:/node/npx.cmd", "C:/node/npx.cmd", "C:/node/npm.cmd"]


def test_passo_que_estoura_o_tempo_reprova(raiz, monkeypatch, capsys):
    def estoura(comando, **kwargs):
        raise subprocess.TimeoutExpired(comando, kwargs["timeout"])

    monkeypatch.setattr(portao.subprocess, "run", estoura)

    assert portao.rodar_portao(raiz) != 0
    assert "passou de" in capsys.readouterr().out


def test_venv_ausente_falha_com_mensagem_sem_rodar_nada(tmp_path, monkeypatch, capsys):
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)

    assert portao.rodar_portao(tmp_path) != 0
    saida = capsys.readouterr().out
    assert "backend" in saida and ".venv" in saida
    assert "bootstrap.ps1 -Dev" in saida
    assert duble.chamadas == []


def test_npm_ausente_falha_com_mensagem_sem_rodar_nada(raiz, monkeypatch, capsys):
    duble = SubprocessDuble()
    monkeypatch.setattr(portao.subprocess, "run", duble)
    monkeypatch.setattr(portao.shutil, "which", lambda nome: None)

    assert portao.rodar_portao(raiz) != 0
    assert "npm" in capsys.readouterr().out
    assert duble.chamadas == []


def test_a_raiz_vem_do_proprio_arquivo():
    """Rodado de qualquer worktree, o portão confere aquele worktree."""
    assert _SCRIPT.parents[1] == portao.RAIZ

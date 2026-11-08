"""O bin/portao.py roda o portão do AGENTS.md e devolve o código certo (D-1078).

O ship do Guia confia no código de saída deste script para decidir o push. Por
isso o que se testa é a ordem dos passos, que a primeira falha encerra com o
código dela, que nada passa por um shell e que a venv ausente vira mensagem em
vez de cair no Python global. O subprocess é um dublê: o portão de verdade não
roda dentro do pytest.
"""

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "portao.py"
_spec = importlib.util.spec_from_file_location("portao", _SCRIPT)
portao = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(portao)


def _texto(comando: list[str]) -> str:
    """O comando como no AGENTS.md: o executável sem pasta nem extensão."""
    return " ".join([Path(comando[0]).stem, *comando[1:]])


class PassoFalso:
    """O processo de um passo: `wait` devolve o código combinado ou estoura o tempo."""

    def __init__(self, comando, kwargs, codigo: int, estoura: bool):
        self.comando, self.kwargs, self.pid = comando, kwargs, 4242
        self.codigo, self.estoura = codigo, estoura
        self.esperas: list[float] = []

    def wait(self, timeout=None):
        self.esperas.append(timeout)
        if self.estoura and len(self.esperas) == 1:
            raise subprocess.TimeoutExpired(self.comando, timeout)
        return self.codigo


class SubprocessDuble:
    """Faz o papel do `Popen` (registra cada passo) e do `run` (registra o taskkill)."""

    def __init__(self, codigos=None, estoura=(), ausente=()):
        self.codigos, self.estoura, self.ausente = codigos or {}, estoura, ausente
        self.passos: list[PassoFalso] = []
        self.runs: list[list[str]] = []

    def popen(self, comando, **kwargs):
        if _texto(comando) in self.ausente:
            raise FileNotFoundError(2, "O sistema não pode encontrar o arquivo especificado")
        passo = PassoFalso(
            list(comando),
            kwargs,
            self.codigos.get(_texto(comando), 0),
            _texto(comando) in self.estoura,
        )
        self.passos.append(passo)
        return passo

    def run(self, comando, **kwargs):
        self.runs.append(list(comando))
        return subprocess.CompletedProcess(comando, 0)

    def comandos(self) -> list[str]:
        return [_texto(p.comando) for p in self.passos]


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


def usar(monkeypatch, duble: SubprocessDuble) -> SubprocessDuble:
    monkeypatch.setattr(portao.subprocess, "Popen", duble.popen)
    monkeypatch.setattr(portao.subprocess, "run", duble.run)
    return duble


def test_roda_os_oito_passos_na_ordem_do_agents_md(raiz, monkeypatch):
    duble = usar(monkeypatch, SubprocessDuble())

    assert portao.rodar_portao(raiz) == 0
    assert duble.comandos() == ORDEM_DO_AGENTS_MD


def test_backend_roda_pela_venv_e_frontend_pela_pasta_dele(raiz, monkeypatch):
    duble = usar(monkeypatch, SubprocessDuble())

    portao.rodar_portao(raiz)

    scripts = raiz / "backend" / ".venv" / "Scripts"
    backend, frontend = duble.passos[:4], duble.passos[4:]
    assert all(Path(p.comando[0]).parent == scripts for p in backend)
    assert all(p.kwargs["cwd"] == raiz / "backend" for p in backend)
    assert all(p.kwargs["cwd"] == raiz / "frontend" for p in frontend)


def test_primeiro_passo_que_falha_encerra_com_o_codigo_dele(raiz, monkeypatch, capsys):
    duble = usar(monkeypatch, SubprocessDuble({"lint-imports": 3, "npm run build": 7}))

    assert portao.rodar_portao(raiz) == 3
    assert duble.comandos() == ORDEM_DO_AGENTS_MD[:3]
    assert "REPROVADO no passo 3/8 (backend): lint-imports" in capsys.readouterr().out


def test_nenhum_passo_usa_shell_e_todos_tem_timeout(raiz, monkeypatch):
    duble = usar(monkeypatch, SubprocessDuble())

    portao.rodar_portao(raiz)

    assert len(duble.passos) == 8
    for passo in duble.passos:
        assert passo.kwargs.get("shell", False) is False
        assert passo.esperas == [portao.TIMEOUT_DO_PASSO_S]
    assert portao.TIMEOUT_DO_PASSO_S > 0


def test_stderr_de_cada_passo_vai_junto_do_stdout(raiz, monkeypatch):
    """O ship mostra só o fim da saída: a linha do passo reprovado tem de ser a última."""
    duble = usar(monkeypatch, SubprocessDuble())

    portao.rodar_portao(raiz)

    assert all(p.kwargs["stderr"] is subprocess.STDOUT for p in duble.passos)


def test_so_o_lint_imports_recebe_pythonutf8(raiz, monkeypatch):
    """O CI Windows roda o pytest sem PYTHONUTF8: aqui também, senão o verde é falso."""
    monkeypatch.delenv("PYTHONUTF8", raising=False)
    duble = usar(monkeypatch, SubprocessDuble())

    portao.rodar_portao(raiz)

    com_a_variavel = [
        _texto(p.comando)
        for p in duble.passos
        if (p.kwargs.get("env") or os.environ).get("PYTHONUTF8") == "1"
    ]
    assert com_a_variavel == ["lint-imports"]


def test_npm_e_npx_saem_do_path_resolvidos(raiz, monkeypatch):
    """No Windows o npm é npm.cmd: sem shell, o nome solto não se acha."""
    duble = usar(monkeypatch, SubprocessDuble())

    portao.rodar_portao(raiz)

    frontend = [p.comando[0] for p in duble.passos[4:]]
    assert frontend == ["C:/node/npm.cmd", "C:/node/npx.cmd", "C:/node/npx.cmd", "C:/node/npm.cmd"]


def test_passo_que_estoura_o_tempo_mata_a_arvore_pelo_pid_e_reprova(raiz, monkeypatch, capsys):
    duble = usar(monkeypatch, SubprocessDuble(estoura={"npx vitest run"}))

    assert portao.rodar_portao(raiz) != 0
    assert duble.runs == [["taskkill", "/PID", "4242", "/T", "/F"]]
    assert duble.comandos() == ORDEM_DO_AGENTS_MD[:7]
    assert len(duble.passos[-1].esperas) == 2, "espera o processo morto antes de seguir"
    saida = capsys.readouterr().out
    assert "passou de" in saida
    assert "REPROVADO no passo 7/8 (frontend): npx vitest run" in saida


def test_executavel_ausente_reprova_e_nomeia_o_caminho(raiz, monkeypatch, capsys):
    """Venv sem -Dev ou pacote removido: o lint-imports.exe some e o erro vem sem filename."""
    duble = usar(monkeypatch, SubprocessDuble(ausente={"lint-imports"}))

    assert portao.rodar_portao(raiz) == 1
    assert duble.comandos() == ORDEM_DO_AGENTS_MD[:2]
    saida = capsys.readouterr().out
    lint_imports = raiz / "backend" / ".venv" / "Scripts" / "lint-imports.exe"
    assert f"executável não encontrado: {lint_imports}" in saida
    assert "REPROVADO no passo 3/8 (backend): lint-imports" in saida


def test_venv_ausente_falha_com_mensagem_sem_rodar_nada(tmp_path, monkeypatch, capsys):
    duble = usar(monkeypatch, SubprocessDuble())

    assert portao.rodar_portao(tmp_path) != 0
    saida = capsys.readouterr().out
    assert "backend" in saida and ".venv" in saida
    assert "bootstrap.ps1 -Dev" in saida
    assert duble.passos == []


def test_npm_ausente_falha_com_mensagem_sem_rodar_nada(raiz, monkeypatch, capsys):
    duble = usar(monkeypatch, SubprocessDuble())
    monkeypatch.setattr(portao.shutil, "which", lambda nome: None)

    assert portao.rodar_portao(raiz) != 0
    assert "npm" in capsys.readouterr().out
    assert duble.passos == []


def test_a_raiz_vem_do_proprio_arquivo():
    """Rodado de qualquer worktree, o portão confere aquele worktree."""
    assert _SCRIPT.parents[1] == portao.RAIZ


def test_rodado_de_verdade_sem_venv_sai_com_2_e_mensagem_em_utf8(tmp_path):
    """De ponta a ponta, sem rodar passo nenhum: a venv falta na raiz copiada."""
    (tmp_path / "bin").mkdir()
    shutil.copy(_SCRIPT, tmp_path / "bin" / "portao.py")
    ambiente = {k: v for k, v in os.environ.items() if k not in ("PYTHONIOENCODING", "PYTHONUTF8")}

    feito = subprocess.run(
        [sys.executable, str(tmp_path / "bin" / "portao.py")],
        capture_output=True,
        env=ambiente,
        timeout=60,
    )

    assert feito.returncode == 2
    assert "Portão NÃO rodou" in feito.stdout.decode("utf-8")

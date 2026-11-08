"""Portão de qualidade do AGENTS.md num comando só (D-1078).

O ship do Guia roda o `delivery.gate.full` do `.guia/process.json` sobre a
árvore já commitada e só faz o push se o comando sair com 0. Com a chave
vazia, o ship só avisava e empurrava: os PRs #338 e #344 reprovaram no CI por
catracas que leem `git ls-files` e não enxergam arquivo novo antes do commit.

Este script roda, em sequência, o portão do AGENTS.md: o backend pela
`backend/.venv` (nunca o Python global) e o frontend pelo npm do PATH. Para no
primeiro passo que falhar e sai com o código dele. Nenhum passo passa por shell
nem por pipe, que mentem o código de saída.

O `frontend/.env.local` não faz falta aqui: lint, tipos, vitest e build não
falam com backend nenhum (os testes de API usam `vi.stubEnv`).

Uso (de qualquer worktree, que confere o próprio worktree): python bin/portao.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import NamedTuple

RAIZ = Path(__file__).resolve().parents[1]
TIMEOUT_DO_PASSO_S = 20 * 60


class Passo(NamedTuple):
    pasta: str
    comando: list[str]


class PortaoNaoRoda(Exception):
    """Falta o que o portão precisa para rodar; nenhum passo foi executado."""


def localizar_scripts_da_venv(raiz: Path) -> Path:
    scripts = raiz / "backend" / ".venv" / "Scripts"
    if not (scripts / "python.exe").is_file():
        raise PortaoNaoRoda(
            f"Falta a venv do backend: {scripts / 'python.exe'} não existe. "
            "Rode bin/bootstrap.ps1 -Dev na árvore principal (o worktree recebe a "
            "backend/.venv por junção ao ser criado pelo guia worktree add). "
            "O portão não cai no Python global."
        )
    return scripts


def localizar_no_path(nome: str) -> str:
    """Caminho completo de npm/npx: no Windows é `npm.cmd`, que sem shell só se acha assim."""
    caminho = shutil.which(nome)
    if caminho is None:
        raise PortaoNaoRoda(f"`{nome}` não está no PATH: instale o Node 24 (docs/SETUP.md).")
    return caminho


def montar_passos(raiz: Path) -> list[Passo]:
    scripts = localizar_scripts_da_venv(raiz)
    npm, npx = localizar_no_path("npm"), localizar_no_path("npx")
    return [
        Passo("backend", [str(scripts / "ruff.exe"), "check", "."]),
        Passo("backend", [str(scripts / "ruff.exe"), "format", "--check", "."]),
        Passo("backend", [str(scripts / "lint-imports.exe")]),
        Passo(
            "backend",
            [str(scripts / "python.exe"), "-m", "pytest", "-m", "not integration", "-n", "6"],
        ),
        Passo("frontend", [npm, "run", "lint"]),
        Passo("frontend", [npx, "tsc", "--noEmit"]),
        Passo("frontend", [npx, "vitest", "run"]),
        Passo("frontend", [npm, "run", "build"]),
    ]


def descrever(passo: Passo) -> str:
    """O comando como está no AGENTS.md, sem a pasta do executável."""
    return " ".join([Path(passo.comando[0]).stem, *passo.comando[1:]])


def executar(passo: Passo, raiz: Path) -> int:
    # PYTHONUTF8: sem ele o lint-imports sai com 1 no Windows ao imprimir (docs/qualidade.md).
    ambiente = {**os.environ, "PYTHONUTF8": "1"}
    try:
        return subprocess.run(
            passo.comando, cwd=raiz / passo.pasta, env=ambiente, timeout=TIMEOUT_DO_PASSO_S
        ).returncode
    except subprocess.TimeoutExpired:
        print(f"   o passo passou de {TIMEOUT_DO_PASSO_S // 60} min e foi interrompido.")
        return 1
    except FileNotFoundError as erro:
        print(f"   executável não encontrado: {erro.filename}")
        return 1


def rodar_portao(raiz: Path = RAIZ) -> int:
    try:
        passos = montar_passos(raiz)
    except PortaoNaoRoda as erro:
        print(f"Portão NÃO rodou: {erro}")
        return 2
    inicio = time.monotonic()
    for numero, passo in enumerate(passos, start=1):
        rotulo = f"passo {numero}/{len(passos)} ({passo.pasta}): {descrever(passo)}"
        print(f"== {rotulo}", flush=True)
        codigo = executar(passo, raiz)
        if codigo != 0:
            print(f"Portão REPROVADO no {rotulo} — código {codigo}.")
            return codigo
    print(f"Portão verde: {len(passos)} passos em {time.monotonic() - inicio:.0f} s.")
    return 0


if __name__ == "__main__":
    sys.exit(rodar_portao())

"""Os serviços do `dev.ps1` não herdam o console do lançador (D-885).

Herdado, o console virava o teclado do Remotion Studio, que o lê em modo TTY
para os atalhos. Uma falha nessa leitura derrubou o app do Paulo:

    [REM]  Error: read UNKNOWN
    [REM]      at TTY.onStreamRead (node:internal/stream_base_commons:216:20)
    ERRO: remotion encerrou (exit code 1)
    Encerrando servicos e descendentes...

O teste carrega do `dev.ps1` só a função que monta o início de um serviço, sobe
um Node com ela e pergunta ao próprio filho o que é a entrada dele. O lançador
do teste roda com a entrada em NUL — um dispositivo de caractere, como o
console —, então um filho que a herdasse responderia "caractere"; com o pipe do
lançador, não.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

pytestmark = [
    pytest.mark.skipif(
        shutil.which("powershell") is None or shutil.which("node") is None,
        reason="precisa do PowerShell do Windows e do node no PATH",
    ),
    pytest.mark.integration,  # sobe PowerShell e Node de verdade
]

SONDA = (
    "const s = require('fs').fstatSync(0);\n"
    "process.stdout.write(JSON.stringify({ caractere: s.isCharacterDevice(), tty: !!process.stdin.isTTY }));\n"
)


def _entrada_vista_pelo_servico(tmp_path: Path) -> dict:
    sonda = tmp_path / "sonda.js"
    sonda.write_text(SONDA, encoding="utf-8")
    lancador = tmp_path / "lancador.ps1"
    lancador.write_text(
        f"""
$ErrorActionPreference = 'Stop'
$ast = [System.Management.Automation.Language.Parser]::ParseFile('{RAIZ / "dev.ps1"}', [ref]$null, [ref]$null)
$funcao = $ast.Find({{
    param($n)
    $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'New-DevStartInfo'
}}, $true)
. ([scriptblock]::Create($funcao.Extent.Text))
$inicio = New-DevStartInfo -FileName 'node' -Arguments '"{sonda}"' -WorkingDirectory '{tmp_path}'
$processo = [System.Diagnostics.Process]::Start($inicio)
$saida = $processo.StandardOutput.ReadToEnd()
$processo.WaitForExit()
[Console]::Out.Write($saida)
""",
        encoding="utf-8-sig",
    )
    resultado = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(lancador)],
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr
    return json.loads(resultado.stdout)


def test_o_servico_recebe_um_pipe_e_nao_o_console(tmp_path):
    entrada = _entrada_vista_pelo_servico(tmp_path)
    assert entrada == {"caractere": False, "tty": False}

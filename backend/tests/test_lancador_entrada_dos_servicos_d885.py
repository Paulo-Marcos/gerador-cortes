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

Os testes estáticos guardam a ligação: de nada vale a função certa se o
`Start-DevProcess` voltar a montar o próprio início ou desligar a entrada.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]

precisa_de_powershell_e_node = pytest.mark.skipif(
    shutil.which("powershell") is None or shutil.which("node") is None,
    reason="precisa do PowerShell do Windows e do node no PATH",
)


def _dev_ps1_sem_comentarios() -> str:
    texto = (RAIZ / "dev.ps1").read_text(encoding="utf-8-sig")
    return re.sub(r"^[ \t]*#.*$", "", texto, flags=re.MULTILINE)


def _corpo_da_funcao(texto: str, nome: str) -> str:
    achado = re.search(
        rf"^function {nome} \{{\n(.*?)^\}}", texto.replace("\r\n", "\n"), re.MULTILINE | re.DOTALL
    )
    assert achado, f"função {nome} não encontrada no dev.ps1"
    return achado.group(1)


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


@precisa_de_powershell_e_node
@pytest.mark.integration  # sobe PowerShell e Node de verdade
def test_o_servico_recebe_um_pipe_e_nao_o_console(tmp_path):
    entrada = _entrada_vista_pelo_servico(tmp_path)
    assert entrada == {"caractere": False, "tty": False}


def test_start_devprocess_monta_o_inicio_pela_funcao_e_nao_mexe_na_entrada():
    corpo = _corpo_da_funcao(_dev_ps1_sem_comentarios(), "Start-DevProcess")
    assert re.search(r"\$process\.StartInfo = New-DevStartInfo ", corpo)
    assert "ProcessStartInfo" not in corpo
    assert "RedirectStandardInput" not in corpo


# A única outra partida de processo do dev.ps1: o Python de vida curta que lê o
# nível de log antes de subir os serviços. Não é serviço e não lê o teclado.
LEITURA_DO_NIVEL_DE_LOG = "Get-ConfiguredLogLevel"
INICIO_DE_PROCESSO = r"ProcessStartInfo\]::new|New-Object System\.Diagnostics\.ProcessStartInfo"


def test_so_a_new_devstartinfo_monta_o_inicio_dos_servicos_e_decide_a_entrada():
    texto = _dev_ps1_sem_comentarios()
    funcao = _corpo_da_funcao(texto, "New-DevStartInfo")
    resto = texto.replace(funcao, "").replace(_corpo_da_funcao(texto, LEITURA_DO_NIVEL_DE_LOG), "")
    assert len(re.findall(INICIO_DE_PROCESSO, funcao)) == 1
    assert not re.findall(INICIO_DE_PROCESSO, resto)
    assert re.findall(r"RedirectStandardInput.*", texto) == ["RedirectStandardInput = $true"]
    assert "RedirectStandardInput = $true" in funcao


def test_todo_servico_sobe_pelo_start_devprocess():
    texto = _dev_ps1_sem_comentarios()
    assert re.search(
        r"foreach \(\$svc in \$services\) \{\s*\$running \+= Start-DevProcess @svc\s*\}", texto
    )
    fora = texto.replace(_corpo_da_funcao(texto, "Start-DevProcess"), "").replace(
        _corpo_da_funcao(texto, LEITURA_DO_NIVEL_DE_LOG), ""
    )
    for partida in ("Diagnostics.Process]::new", "Process]::Start(", "Start-Process "):
        assert partida not in fora

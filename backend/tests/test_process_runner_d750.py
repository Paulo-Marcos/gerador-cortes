"""O runner único de processo externo (D-750).

Cada comportamento roda nos dois caminhos: o do asyncio e o fallback síncrono que
entra quando o event loop é o Selector do uvicorn no Windows (D-369). As cópias
que o runner substitui tinham os dois, e é neles que um defeito se esconderia.
"""

import os
import sys
import time
from pathlib import Path

import psutil
import pytest
from app.core import process_runner

pytestmark = pytest.mark.integration  # sobe processos de verdade (D-751)

PY = sys.executable


@pytest.fixture(params=["asyncio", "fallback-windows"])
def modo(request, monkeypatch):
    if request.param == "fallback-windows":

        async def _selector_sem_subprocesso(*args, **kwargs):
            raise NotImplementedError

        monkeypatch.setattr(
            process_runner.asyncio, "create_subprocess_exec", _selector_sem_subprocesso
        )
    return request.param


@pytest.mark.asyncio
async def test_devolve_o_codigo_e_a_saida_com_o_stderr_junto(modo, tmp_path):
    programa = "import sys; print('na saida'); print('no erro', file=sys.stderr); sys.exit(3)"

    resultado = await process_runner.rodar([PY, "-c", programa], cwd=tmp_path, timeout=60)

    assert resultado.returncode == 3
    assert "na saida" in resultado.saida
    assert "no erro" in resultado.saida


@pytest.mark.asyncio
async def test_roda_no_diretorio_pedido(modo, tmp_path):
    programa = "import os; print(os.getcwd())"

    resultado = await process_runner.rodar([PY, "-c", programa], cwd=tmp_path, timeout=60)

    assert Path(resultado.saida.strip()).samefile(tmp_path)


@pytest.mark.asyncio
async def test_sem_timeout_espera_o_processo_terminar(modo, tmp_path):
    programa = "import time; time.sleep(0.5); print('terminou')"

    resultado = await process_runner.rodar([PY, "-c", programa], cwd=tmp_path, timeout=None)

    assert resultado.returncode == 0
    assert "terminou" in resultado.saida


_PAI_COM_FILHO = (
    "import os, pathlib, subprocess, sys, time\n"
    "filho = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
    "pathlib.Path(sys.argv[1]).write_text(f'{os.getpid()} {filho.pid}')\n"
    "time.sleep(120)\n"
)


@pytest.mark.asyncio
async def test_estourar_o_tempo_mata_o_processo_e_os_filhos(modo, tmp_path):
    # O `node` dos geradores sobe um Chromium como filho: matar só o pai deixaria
    # o filho rodando. O pai aqui faz o mesmo e diz os dois PIDs.
    arquivo_pids = tmp_path / "pids.txt"
    inicio = time.monotonic()

    with pytest.raises(process_runner.ProcessoEstourouOTempo):
        await process_runner.rodar(
            [PY, "-c", _PAI_COM_FILHO, str(arquivo_pids)], cwd=tmp_path, timeout=5
        )

    assert time.monotonic() - inicio < 60, "o timeout não foi respeitado"
    pai, filho = (int(pid) for pid in arquivo_pids.read_text().split())
    assert not psutil.pid_exists(pai), "o processo que estourou o tempo continuou vivo"
    assert not psutil.pid_exists(filho), "o filho ficou órfão, rodando"
    assert pai != os.getpid()

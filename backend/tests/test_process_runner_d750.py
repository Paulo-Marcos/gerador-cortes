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
from app.services import capa_tiktok, palco_short_png, youtube_palco

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


@pytest.mark.integration  # sobe processos de verdade (D-751)
@pytest.mark.asyncio
async def test_devolve_o_codigo_e_a_saida_com_o_stderr_junto(modo, tmp_path):
    programa = "import sys; print('na saida'); print('no erro', file=sys.stderr); sys.exit(3)"

    resultado = await process_runner.rodar([PY, "-c", programa], cwd=tmp_path, timeout=60)

    assert resultado.returncode == 3
    assert "na saida" in resultado.saida
    assert "no erro" in resultado.saida


@pytest.mark.integration  # sobe processos de verdade (D-751)
@pytest.mark.asyncio
async def test_roda_no_diretorio_pedido(modo, tmp_path):
    programa = "import os; print(os.getcwd())"

    resultado = await process_runner.rodar([PY, "-c", programa], cwd=tmp_path, timeout=60)

    assert Path(resultado.saida.strip()).samefile(tmp_path)


@pytest.mark.integration  # sobe processos de verdade (D-751)
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


@pytest.mark.integration  # sobe processos de verdade (D-751)
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


# ─── Os geradores e o timeout: travar vira a falha de sempre, não exceção nova ───


@pytest.fixture
def gerador_travado(monkeypatch):
    """O runner estoura o tempo, e anota o timeout que cada gerador pediu."""
    pedidos: list[float | None] = []

    async def _estoura(argumentos, *, cwd, timeout):
        pedidos.append(timeout)
        raise process_runner.ProcessoEstourouOTempo(f"node passou de {timeout}s")

    monkeypatch.setattr(process_runner, "rodar", _estoura)
    return pedidos


@pytest.mark.asyncio
async def test_palco_do_short_travado_deixa_o_render_seguir_sem_moldura(
    gerador_travado, monkeypatch, tmp_path
):
    monkeypatch.setattr(palco_short_png, "_cache_dir", lambda: tmp_path)

    palco = await palco_short_png._gerar(
        "chave", tmp_path / "palco.png", {"fundo": "hud-forte", "janelas": []}
    )

    assert palco is None
    assert gerador_travado == [300]


@pytest.mark.asyncio
async def test_palco_do_youtube_travado_vira_falha_visivel(gerador_travado, monkeypatch, tmp_path):
    monkeypatch.setattr(youtube_palco, "_cache_dir", lambda: tmp_path)
    props = {
        "fundo": "f",
        "placa": {},
        "telas": 2,
        "crop_tela": {},
        "crop_facecam": {},
        "slot_tela": {},
        "slot_facecam": {},
    }

    falha = await youtube_palco._ensure_png_para_props(props, destino=tmp_path / "chave.png")

    assert isinstance(falha, youtube_palco.PalcoPngFalha)
    assert falha.returncode == -1
    assert "passou de 300" in falha.saida
    assert gerador_travado == [300]


@pytest.mark.asyncio
async def test_capa_do_tiktok_travada_chega_ao_operador_como_erro_da_capa(
    gerador_travado, tmp_path
):
    with pytest.raises(capa_tiktok.CapaTikTokError):
        await capa_tiktok._rasterizar(tmp_path / "capa.png", {})

    assert gerador_travado == [300]

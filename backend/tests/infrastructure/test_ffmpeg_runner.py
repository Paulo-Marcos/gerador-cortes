"""O executor de comandos do FFmpeg (D-719).

Tinha 60% de cobertura medida no Windows, e nenhum teste com o nome dele. A
maior parte do que faltava é o caminho de fora do Windows
(`create_subprocess_exec`), que o CI em Linux percorre e esta máquina não: aqui
ele é exercitado trocando o `sys` que o módulo enxerga — o loop dos testes é o
Proactor, que sobe subprocesso assíncrono no Windows também.

No lugar do ffmpeg entra um Python curto: o executor não sabe nem precisa saber
que programa roda. Os testes que sobem processo levam `integration` (D-751).
"""

import asyncio
import logging
import sys
import types

import pytest
from app.infrastructure import ffmpeg_runner as runner

PY = sys.executable


def _comando(codigo: str) -> list[str]:
    return [PY, "-c", codigo]


OK = _comando("import sys; print('saida'); print('aviso', file=sys.stderr)")
FALHA = _comando("import sys; print('x' * 600 + 'fim', file=sys.stderr); sys.exit(3)")
DEMORA = _comando("import time; time.sleep(30)")


@pytest.fixture
def fora_do_windows(monkeypatch):
    """O módulo passa a enxergar outra plataforma — o caminho do Linux."""
    monkeypatch.setattr(runner, "sys", types.SimpleNamespace(platform="linux"))


@pytest.fixture
def no_windows(monkeypatch):
    """O módulo enxerga o Windows — o caminho em thread —, rode o teste onde rodar.

    Sem isto os testes do caminho em thread só passavam numa máquina Windows: no
    CI em Linux o executor seguia o caminho assíncrono (visto no CI de 26/09).
    """
    monkeypatch.setattr(runner, "sys", types.SimpleNamespace(platform="win32"))


# ─── Puros: a leitura das sondas e do stream ─────────────────────────────────


@pytest.mark.parametrize(
    ("bruto", "esperado"),
    [
        ("1280x720", (1280, 720)),
        (" 1920x1080\n", (1920, 1080)),
        ("0x720", None),
        ("lixo", None),
        ("", None),
    ],
)
def test_resolucao_so_vale_com_os_dois_lados_positivos(bruto, esperado):
    assert runner._parse_resolucao(bruto) == esperado


@pytest.mark.parametrize(("bruto", "esperado"), [("12.5\n", 12.5), ("N/A", None), (None, None)])
def test_duracao_que_nao_e_numero_vira_none(bruto, esperado):
    assert runner._parse_duracao(bruto) == esperado


def _stream(*pedacos: bytes) -> asyncio.StreamReader:
    leitor = asyncio.StreamReader()
    for pedaco in pedacos:
        leitor.feed_data(pedaco)
    leitor.feed_eof()
    return leitor


@pytest.mark.asyncio
async def test_o_stream_capturado_volta_inteiro_e_o_nao_capturado_so_a_cauda():
    inteiro = await runner._drain_stream(_stream(b"a" * 700, b"b"), "t", capture=True)
    cauda = await runner._drain_stream(_stream(b"a" * 700, b"b"), "t", capture=False)

    assert inteiro == "a" * 700 + "b"
    # O leitor junta os pedaços numa leitura só: a cauda são os últimos 500 caracteres.
    assert cauda == ("a" * 700 + "b")[-500:]


@pytest.mark.asyncio
async def test_linha_de_erro_vai_ao_log_mesmo_dentro_do_intervalo(caplog):
    caplog.set_level(logging.INFO, logger=runner.logger.name)

    await runner._drain_stream(
        _stream(b"frame=1\rframe=2\rError opening file\r"), "rotulo", log_interval=3600
    )

    linhas = [r.getMessage() for r in caplog.records]
    assert "[rotulo] frame=1" in linhas  # a primeira sempre sai
    assert "[rotulo] frame=2" not in linhas  # dentro do intervalo, calada
    assert "[rotulo] Error opening file" in linhas


# ─── O caminho do Windows: processo em thread ────────────────────────────────


@pytest.mark.integration
def test_sync_devolve_codigo_saida_e_erro():
    assert runner._run_ffmpeg_sync(OK, "t") == (0, "saida\n", "aviso\n")


@pytest.mark.integration
def test_sync_que_falha_devolve_o_codigo_do_processo():
    codigo, _, erro = runner._run_ffmpeg_sync(FALHA, "t")

    assert codigo == 3 and erro.rstrip().endswith("fim")


@pytest.mark.integration
def test_sync_sem_o_programa_vira_menos_um():
    codigo, saida, erro = runner._run_ffmpeg_sync(["programa-que-nao-existe-d719"], "t")

    assert (codigo, saida) == (-1, "") and "Erro ao executar subprocesso sync" in erro


@pytest.mark.integration
def test_sync_que_estoura_o_prazo_e_encerrado():
    codigo, _, erro = runner._run_ffmpeg_sync(DEMORA, "t", timeout=0.5)

    assert codigo == -1 and erro.startswith("Timeout apos")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_no_windows_a_saida_so_volta_quando_pedida(no_windows):
    com = await runner.run_ffmpeg(OK, label="t", capture_output=True)
    sem = await runner.run_ffmpeg(OK, label="t")

    assert (com.returncode, com.stdout.strip(), com.stderr.strip()) == (0, "saida", "aviso")
    assert (sem.stdout, sem.stderr, sem.stderr_tail.strip()) == ("", "", "aviso")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_no_windows_o_simples_que_falha_levanta_com_a_cauda(no_windows):
    with pytest.raises(RuntimeError, match=r"t falhou \(thread\): x+fim"):
        await runner.run_ffmpeg_simple(FALHA, label="t")


# ─── O caminho de fora do Windows: subprocesso assíncrono ────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fora_do_windows_captura_a_saida(fora_do_windows):
    resultado = await runner.run_ffmpeg(OK, label="t", capture_output=True)

    assert resultado.returncode == 0
    assert (resultado.stdout.strip(), resultado.stderr.strip()) == ("saida", "aviso")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fora_do_windows_o_prazo_estourado_levanta(fora_do_windows):
    with pytest.raises(RuntimeError, match=r"t timed out"):
        await runner.run_ffmpeg(DEMORA, label="t", timeout=1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_fora_do_windows_o_simples_devolve_ou_levanta(fora_do_windows):
    resultado = await runner.run_ffmpeg_simple(OK, label="t", capture_output=True)
    assert (resultado.returncode, resultado.stdout.strip()) == (0, "saida")

    with pytest.raises(RuntimeError, match=r"t falhou: x+fim"):
        await runner.run_ffmpeg_simple(FALHA, label="t")

    with pytest.raises(RuntimeError, match=r"t falhou: timeout apos 1s"):
        await runner.run_ffmpeg_simple(DEMORA, label="t", timeout=1)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_sem_subprocesso_assincrono_cai_na_thread(fora_do_windows, monkeypatch):
    async def selector_sem_subprocesso(*_a, **_k):
        raise NotImplementedError

    monkeypatch.setattr(runner.asyncio, "create_subprocess_exec", selector_sem_subprocesso)

    resultado = await runner.run_ffmpeg(OK, label="t", capture_output=True)
    assert resultado.stdout.strip() == "saida"
    with pytest.raises(RuntimeError, match=r"\(thread\)"):
        await runner.run_ffmpeg_simple(FALHA, label="t")

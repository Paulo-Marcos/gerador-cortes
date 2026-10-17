"""D-964: o PNG do palco do short não reempacota o Remotion a cada geração.

O gen-short-palco.mjs rodava `remotion still` sobre o entry cru, como o do
YouTube antes da D-963: 60 s de webpack para menos de 1 s de captura, a cada PNG.
Com os overlays do render disputando a CPU, o empacotamento passa de 300 s e o
short sai sem a moldura do canal. Agora o pacote do palco do short é montado uma
vez por versão do renderer e cada PNG só abre o Chrome sobre ele.
"""

import asyncio
import os
import subprocess
from pathlib import Path

import app.services.palco_short_png as psp
import pytest
from app.core import process_runner

PROPS = {"fundo": "hud-forte", "janelas": [{"x": 0, "y": 0, "w": 1080, "h": 1920}]}


def _gerador_falso(monkeypatch, tmp_path, *, pacote_pronto: bool, demora: float = 0):
    """Troca o node por um falso que anota argumentos, prazo e simultaneidade.

    Como o node de verdade, o falso deixa o pacote pronto ao rodar e escreve o PNG.
    """
    pacote = tmp_path / "pacotes" / "fp-atual"
    if pacote_pronto:
        pacote.mkdir(parents=True)
        (pacote / "index.html").write_text("ok", encoding="utf-8")

    async def _pacote_do_palco():
        return pacote

    monkeypatch.setattr(psp, "_pacote_do_palco", _pacote_do_palco, raising=False)
    monkeypatch.setattr(psp, "_cache_dir", lambda: tmp_path / "cache")
    chamadas: list[dict] = []
    rodando = {"agora": 0, "maximo_empacotando": 0}

    async def _rodar(argumentos, *, cwd, timeout):
        empacotando = not (pacote / "index.html").exists()
        chamadas.append({"argumentos": argumentos, "timeout": timeout, "empacotou": empacotando})
        rodando["agora"] += 1
        if empacotando:
            rodando["maximo_empacotando"] = max(rodando["maximo_empacotando"], rodando["agora"])
        await asyncio.sleep(demora)
        pacote.mkdir(parents=True, exist_ok=True)
        (pacote / "index.html").write_text("ok", encoding="utf-8")
        Path(argumentos[2]).write_bytes(b"png")
        rodando["agora"] -= 1
        return process_runner.Resultado(0, "ok")

    monkeypatch.setattr(process_runner, "rodar", _rodar)
    return pacote, chamadas, rodando


@pytest.mark.asyncio
async def test_pacote_pronto_o_node_recebe_o_pacote_e_o_prazo_curto(tmp_path, monkeypatch):
    pacote, chamadas, _ = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=True)
    destino = tmp_path / "cache" / "short-k.png"

    assert await psp._gerar("k", destino, PROPS) == destino
    assert chamadas[0]["argumentos"][-1] == str(pacote)
    assert chamadas[0]["timeout"] == psp._TIMEOUT_DO_GERADOR_SEG


@pytest.mark.asyncio
async def test_sem_pacote_o_node_empacota_com_o_prazo_do_empacotamento(tmp_path, monkeypatch):
    pacote, chamadas, _ = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=False)

    await psp._gerar("k", tmp_path / "cache" / "short-k.png", PROPS)

    assert chamadas[0]["argumentos"][-1] == str(pacote)
    assert chamadas[0]["timeout"] == psp._TIMEOUT_COM_EMPACOTAMENTO_SEG


@pytest.mark.asyncio
async def test_varios_pngs_sem_pacote_so_um_empacota(tmp_path, monkeypatch):
    _, chamadas, rodando = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=False, demora=0.05)

    await asyncio.gather(
        *[psp._gerar(f"k{i}", tmp_path / "cache" / f"short-k{i}.png", PROPS) for i in range(3)]
    )

    assert sum(c["empacotou"] for c in chamadas) == 1
    assert rodando["maximo_empacotando"] == 1
    assert [c["timeout"] for c in chamadas[1:]] == [psp._TIMEOUT_DO_GERADOR_SEG] * 2


@pytest.mark.asyncio
async def test_o_pacote_do_short_vive_numa_pasta_propria_por_versao_do_renderer(monkeypatch):
    async def _fingerprint(renderer_dir):
        assert renderer_dir == psp._RENDERER_DIR
        return "fp-123"

    monkeypatch.setattr(psp, "fingerprint_do_bundle_async", _fingerprint)

    pacote = await psp._pacote_do_palco()

    assert pacote == psp._RENDERER_DIR / ".bundle-cache-short" / "fp-123"


@pytest.mark.integration  # sobe o Remotion de verdade (D-751)
def test_gerador_monta_o_pacote_uma_vez_e_reaproveita(tmp_path: Path):
    if not (psp._RENDERER_DIR / "node_modules").exists():
        pytest.skip("renderer sem node_modules")
    pacote = tmp_path / "pacotes" / "fp-atual"
    # O anterior mais recente fica (um still de outro canal pode estar nele);
    # o mais velho e a sobra de um node morto no meio do webpack saem.
    velho, anterior, sobra = (
        tmp_path / "pacotes" / n for n in ("fp-velho", "fp-anterior", "x.tmp-1")
    )
    for idade, pasta in enumerate((velho, anterior, sobra)):
        pasta.mkdir(parents=True)
        os.utime(pasta, (1_000_000 + idade, 1_000_000 + idade))

    def _gerar(nome: str) -> Path:
        destino = tmp_path / nome
        subprocess.run(
            ["node", str(psp._GEN_SCRIPT), str(destino), "", str(pacote)],
            cwd=psp._REPO_ROOT,
            check=True,
            timeout=900,
        )
        return destino

    primeiro = _gerar("a.png")
    montado_em = os.stat(pacote / "index.html").st_mtime_ns
    segundo = _gerar("b.png")

    assert primeiro.read_bytes() == segundo.read_bytes()
    assert os.stat(pacote / "index.html").st_mtime_ns == montado_em
    assert anterior.exists()
    assert not velho.exists()
    assert not sobra.exists()

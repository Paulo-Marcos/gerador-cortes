"""D-963: o PNG do palco não reempacota o Remotion a cada geração.

O gen-youtube-palco.mjs rodava `remotion still` sobre o entry cru: medido no DEV
com a máquina quieta, 60 s de webpack e menos de 1 s de captura, a cada PNG. Na
PROD, com os overlays do mesmo render disputando a CPU, o empacotamento passou de
300 s duas vezes seguidas e o render bloqueou. Agora o pacote do palco é montado
uma vez por versão do renderer e cada PNG só abre o Chrome sobre ele (19 s).
"""

import asyncio
import os
import subprocess
from pathlib import Path

import app.services.youtube_palco as yp
import pytest
from app.core import process_runner

PROPS = {
    "fundo": "f",
    "placa": {},
    "telas": 2,
    "crop_tela": {},
    "crop_facecam": {},
    "slot_tela": {},
    "slot_facecam": {},
}


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

    monkeypatch.setattr(yp, "_pacote_do_palco", _pacote_do_palco, raising=False)
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path / "cache")
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

    monkeypatch.setattr(yp.process_runner, "rodar", _rodar)
    return pacote, chamadas, rodando


@pytest.mark.asyncio
async def test_pacote_pronto_o_node_recebe_o_pacote_e_o_prazo_curto(tmp_path, monkeypatch):
    pacote, chamadas, _ = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=True)

    resultado = await yp._ensure_png_para_props(PROPS, destino=tmp_path / "cache" / "k.png")

    assert resultado == tmp_path / "cache" / "k.png"
    assert chamadas[0]["argumentos"][-1] == str(pacote)
    assert chamadas[0]["timeout"] == yp._TIMEOUT_DO_GERADOR_SEG


@pytest.mark.asyncio
async def test_sem_pacote_o_node_empacota_com_o_prazo_do_empacotamento(tmp_path, monkeypatch):
    pacote, chamadas, _ = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=False)

    await yp._ensure_png_para_props(PROPS, destino=tmp_path / "cache" / "k.png")

    assert chamadas[0]["argumentos"][-1] == str(pacote)
    assert chamadas[0]["timeout"] == yp._TIMEOUT_COM_EMPACOTAMENTO_SEG


@pytest.mark.asyncio
async def test_varios_pngs_sem_pacote_so_um_empacota(tmp_path, monkeypatch):
    _, chamadas, rodando = _gerador_falso(monkeypatch, tmp_path, pacote_pronto=False, demora=0.05)

    await asyncio.gather(
        *[
            yp._ensure_png_para_props(PROPS, destino=tmp_path / "cache" / f"k{i}.png")
            for i in range(3)
        ]
    )

    assert sum(c["empacotou"] for c in chamadas) == 1
    assert rodando["maximo_empacotando"] == 1
    assert [c["timeout"] for c in chamadas[1:]] == [yp._TIMEOUT_DO_GERADOR_SEG] * 2


@pytest.mark.integration  # sobe o Remotion de verdade (D-751)
def test_gerador_monta_o_pacote_uma_vez_e_reaproveita(tmp_path: Path):
    if not (yp._RENDERER_DIR / "node_modules").exists():
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
            ["node", str(yp._GEN_SCRIPT), str(destino), "", str(pacote)],
            cwd=yp._REPO_ROOT,
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

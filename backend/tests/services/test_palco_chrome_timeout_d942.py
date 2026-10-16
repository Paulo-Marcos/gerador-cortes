"""D-942: o Chrome que não atende em 25 s não pode bloquear o render.

O `remotion still` desiste do Chrome após 25 s fixos ("Timed out after 25000 ms
while trying to connect to the browser"). Na PROD isso aconteceu com a máquina
ocupada pelo bundle e pelos overlays do mesmo render: falha de carga, não de
layout. O gerador tenta de novo nesse caso; nos demais, falha na primeira.
"""

from pathlib import Path

import app.services.youtube_palco as yp
import pytest
from app.core import process_runner
from app.services.youtube_palco import PalcoPngFalha

PROPS = {
    "fundo": "f",
    "placa": {},
    "telas": 2,
    "crop_tela": {},
    "crop_facecam": {},
    "slot_tela": {},
    "slot_facecam": {},
}

SAIDA_CHROME_MUDO = (
    "TimeoutError: Timed out after 25000 ms while trying to connect to the browser! "
    "Chrome logged the following:\n"
)


def _gerador_falso(monkeypatch, tmp_path, respostas: list[tuple[int, str]]) -> list[list[str]]:
    """Troca o processo do gerador por respostas em sequência; o rc=0 cria o PNG."""
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path)
    monkeypatch.setattr(yp, "_ESPERA_ENTRE_TENTATIVAS_SEG", 0)
    chamadas: list[list[str]] = []

    async def _rodar(argumentos, *, cwd, timeout):
        chamadas.append(argumentos)
        returncode, saida = respostas[len(chamadas) - 1]
        if returncode == 0:
            Path(argumentos[2]).write_bytes(b"png")
        return process_runner.Resultado(returncode, saida)

    monkeypatch.setattr(yp.process_runner, "rodar", _rodar)
    return chamadas


@pytest.mark.asyncio
async def test_chrome_mudo_uma_vez_tenta_de_novo_e_gera_o_png(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, tmp_path, [(1, SAIDA_CHROME_MUDO), (0, "ok")])
    destino = tmp_path / "chave-x.png"

    resultado = await yp._ensure_png_para_props(PROPS, destino=destino)

    assert resultado == destino
    assert destino.exists()
    assert len(chamadas) == 2


@pytest.mark.asyncio
async def test_chrome_mudo_em_todas_as_tentativas_vira_falha_com_diagnostico(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, tmp_path, [(1, SAIDA_CHROME_MUDO)] * 10)

    resultado = await yp._ensure_png_para_props(PROPS, destino=tmp_path / "chave-x.png")

    assert isinstance(resultado, PalcoPngFalha)
    assert "trying to connect to the browser" in resultado.saida
    assert len(chamadas) == yp._TENTATIVAS_COM_CHROME_MUDO


@pytest.mark.asyncio
async def test_outra_falha_do_gerador_nao_tenta_de_novo(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, tmp_path, [(1, "Error: bundle exploded"), (0, "ok")])

    resultado = await yp._ensure_png_para_props(PROPS, destino=tmp_path / "chave-x.png")

    assert isinstance(resultado, PalcoPngFalha)
    assert len(chamadas) == 1

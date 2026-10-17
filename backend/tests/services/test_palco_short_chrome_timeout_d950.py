"""D-950: o palco do short também tenta de novo quando o Chrome não atende.

O `gen-short-palco.mjs` roda o mesmo `remotion still` do palco horizontal, que
desiste do Chrome após 25 s fixos. Com a máquina ocupada o short saía sem a
moldura do canal. A D-942 tratou o horizontal e a D-949 a capa do TikTok; o
short ficou de fora.
"""

from pathlib import Path

import app.services.palco_short_png as psp
import pytest
from app.core import process_runner
from app.services import remotion_still

SAIDA_CHROME_MUDO = (
    "TimeoutError: Timed out after 25000 ms while trying to connect to the browser! "
    "Chrome logged the following:\n"
)


def _gerador_falso(monkeypatch, tmp_path, respostas: list[tuple[int, str]]) -> list[list[str]]:
    """Troca o processo do gerador por respostas em sequência; o rc=0 cria o PNG."""
    monkeypatch.setattr(psp, "_cache_dir", lambda: tmp_path)
    monkeypatch.setattr(remotion_still, "ESPERA_ENTRE_TENTATIVAS_SEG", 0)
    chamadas: list[list[str]] = []

    async def _rodar(argumentos, *, cwd, timeout):
        chamadas.append(argumentos)
        returncode, saida = respostas[len(chamadas) - 1]
        if returncode == 0:
            Path(argumentos[2]).write_bytes(b"png")
        return process_runner.Resultado(returncode, saida)

    monkeypatch.setattr(process_runner, "rodar", _rodar)
    return chamadas


@pytest.mark.asyncio
async def test_chrome_mudo_uma_vez_tenta_de_novo_e_gera_o_palco(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, tmp_path, [(1, SAIDA_CHROME_MUDO), (0, "ok")])
    destino = tmp_path / "short-abc.png"

    assert await psp._gerar("abc", destino, {"fundo": "hud-forte"}) == destino
    assert len(chamadas) == 2


@pytest.mark.asyncio
async def test_outra_falha_do_gerador_nao_tenta_de_novo(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, tmp_path, [(1, "Error: bundle exploded"), (0, "ok")])

    assert await psp._gerar("abc", tmp_path / "short-abc.png", {"fundo": "hud-forte"}) is None
    assert len(chamadas) == 1

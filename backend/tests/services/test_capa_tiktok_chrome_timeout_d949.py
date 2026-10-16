"""D-949: a capa do TikTok também tenta de novo quando o Chrome não atende.

O `gen-capa-tiktok.mjs` roda o mesmo `remotion still` do palco, que desiste do
Chrome após 25 s fixos. Com a máquina ocupada isso derrubava a capa (e o teste
de integração da D-932 no portão com `-n 6`). A D-942 já tratava o palco; a
capa ficou de fora.
"""

from pathlib import Path

import app.services.capa_tiktok as ct
import pytest
from app.core import process_runner
from app.services.capa_tiktok import CapaTikTokError

SAIDA_CHROME_MUDO = (
    "TimeoutError: Timed out after 25000 ms while trying to connect to the browser! "
    "Chrome logged the following:\n"
)


def _gerador_falso(monkeypatch, respostas: list[tuple[int, str]]) -> list[list[str]]:
    """Troca o processo do gerador por respostas em sequência; o rc=0 cria o PNG."""
    monkeypatch.setattr(ct.remotion_still, "ESPERA_ENTRE_TENTATIVAS_SEG", 0)
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
async def test_chrome_mudo_uma_vez_tenta_de_novo_e_gera_a_capa(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, [(1, SAIDA_CHROME_MUDO), (0, "ok")])
    destino = tmp_path / "capa.png"

    await ct._rasterizar(destino, {"etiqueta": "JURO"})

    assert destino.exists()
    assert len(chamadas) == 2


@pytest.mark.asyncio
async def test_chrome_mudo_em_todas_as_tentativas_vira_erro(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, [(1, SAIDA_CHROME_MUDO)] * 10)

    with pytest.raises(CapaTikTokError, match="gerador da capa falhou"):
        await ct._rasterizar(tmp_path / "capa.png", {"etiqueta": "JURO"})

    assert len(chamadas) == ct.remotion_still.TENTATIVAS_COM_CHROME_MUDO


@pytest.mark.asyncio
async def test_outra_falha_do_gerador_nao_tenta_de_novo(tmp_path, monkeypatch):
    chamadas = _gerador_falso(monkeypatch, [(1, "Error: bundle exploded"), (0, "ok")])

    with pytest.raises(CapaTikTokError):
        await ct._rasterizar(tmp_path / "capa.png", {"etiqueta": "JURO"})

    assert len(chamadas) == 1

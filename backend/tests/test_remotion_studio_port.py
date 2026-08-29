"""A porta do Remotion Studio nao pode invadir a faixa do renderer.

O `@remotion/renderer` sobe um servidor HTTP local para servir o bundle durante
o render e escolhe a porta varrendo uma faixa HARDCODED no pacote
(`serve-static.js`: `getDesiredPort({from: 3000, to: 3100})`) — nao ha como
configura-la, so passar uma porta exata via `--port`, que falha duro quando
ocupada e por isso nao serve para renders paralelos.

Com o Studio DENTRO dessa faixa havia corrida: `getDesiredPort` testa se a porta
esta livre e so DEPOIS faz o bind. Com o Studio subindo, a 3000 aparecia livre,
o render a escolhia, e o rebuild do Studio derrubava a conexao:

    [REM]  Server ready - Local: http://localhost:3000
    [WORK] Error: net::ERR_CONNECTION_RESET at http://localhost:3000/index.html

PROD estava em 3000 (base da faixa) e DEV em 3010 (dentro dela). Este teste
existe para que ninguem devolva o Studio para la sem perceber.
"""

import re
from pathlib import Path

from app.config import settings

RENDERER_PORTA_INICIAL = 3000
RENDERER_PORTA_FINAL = 3100

_RAIZ = Path(__file__).resolve().parents[2]


def test_studio_fica_fora_da_faixa_do_renderer():
    porta = settings.remotion_studio_port
    assert not (RENDERER_PORTA_INICIAL <= porta <= RENDERER_PORTA_FINAL), (
        f"Studio em {porta} invade a faixa {RENDERER_PORTA_INICIAL}-{RENDERER_PORTA_FINAL} "
        "que o renderer usa para servir o bundle — volta a corrida de porta."
    )


def _porta_do_script(nome: str) -> int:
    texto = open(_RAIZ / nome, encoding="utf-8-sig").read()
    achado = re.search(r"^\$RemotionPort\s*=\s*(\d+)", texto, re.MULTILINE)
    assert achado, f"$RemotionPort nao encontrado em {nome}"
    return int(achado.group(1))


def test_dev_ps1_usa_a_mesma_porta_da_config():
    """Divergir faria o botao 'Studio Remotion' do editor abrir a porta errada."""
    assert _porta_do_script("dev.ps1") == settings.remotion_studio_port


def test_exemplo_de_portas_do_dev_tambem_fica_fora_da_faixa():
    """O DEV sobrescreve as portas por `dev.ports.local.ps1`; o exemplo guia isso
    e estava em 3010 — dentro da faixa."""
    porta = _porta_do_script("dev.ports.local.ps1.example")
    assert not (RENDERER_PORTA_INICIAL <= porta <= RENDERER_PORTA_FINAL)
    assert porta != settings.remotion_studio_port, "DEV e PROD nao podem disputar a mesma porta"

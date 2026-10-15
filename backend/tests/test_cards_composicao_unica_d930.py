"""O test:cards seleciona a composição uma vez só (D-930).

Em 15/10/2026 a main ficou vermelha duas vezes com "Could not find composition
with ID OverlaySceneV2. Available compositions:" (lista vazia). Cada um dos 80
stills chamava `selectComposition` com 4 abas disputando a CPU, e a repetição
da D-920 nunca disparou: o Remotion entrega a mensagem com "Error: " na frente.
O harness prova os dois consertos ao rodar; isto segura a estrutura, para que
uma edição não volte a selecionar por still sem ninguém ver.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CARDS = RAIZ / "scripts" / "test-remotion-card-contracts.mjs"


def _funcao(script: str, nome: str) -> str:
    inicio = script.index(f"function {nome}(")
    return script[inicio : script.index("\n}\n", inicio)]


def test_cards_chama_select_composition_uma_vez_fora_do_still():
    script = CARDS.read_text(encoding="utf-8")

    # A única chamada passa o selectComposition como argumento, numa linha só.
    assert "prepararComposicoes(\n      selectComposition," in script
    assert len(re.findall(r"^\s+selectComposition,$", script, re.MULTILINE)) == 1
    assert "selectComposition" not in _funcao(script, "runStill")


def test_repeticao_aceita_a_mensagem_com_prefixo_error():
    script = CARDS.read_text(encoding="utf-8")

    assert "/^(?:Error: )?Could not find composition" in script

"""D-1018: a instrução de formato não pode soar como injeção de prompt.

Medido em gerações reais: "Esta instrucao substitui qualquer pedido anterior" fez o
modelo falhar em 5 de 10 (as recusas lidas citam a frase como injeção) e, sem ela, 0 de 5.
"""

from pathlib import Path

from app.domain.compartilhado.manual_prompt import JSON_CODE_BLOCK_INSTRUCTION


def test_nao_manda_substituir_o_pedido_anterior():
    texto = JSON_CODE_BLOCK_INSTRUCTION.lower()
    assert "substitui" not in texto
    assert "chat externo" not in texto


def test_continua_pedindo_o_bloco_de_codigo_json():
    assert "```json" in JSON_CODE_BLOCK_INSTRUCTION


def test_o_frontend_usa_o_mesmo_texto():
    # O frontend só acrescenta a instrução se ela não veio: textos diferentes a duplicariam.
    espelho = (
        Path(__file__).resolve().parents[3] / "frontend" / "src" / "lib" / "manualPrompt.ts"
    ).read_text(encoding="utf-8")
    for linha in JSON_CODE_BLOCK_INSTRUCTION.strip().splitlines():
        assert f"'{linha}'" in espelho, linha

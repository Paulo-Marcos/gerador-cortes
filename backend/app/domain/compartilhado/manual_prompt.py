# D-1018: dizia "Esta instrucao substitui qualquer pedido anterior", e o modelo lia isso
# como injeção de prompt: 5 falhas em 10 gerações reais, contra 0 em 5 com este texto.
# O espelho em frontend/src/lib/manualPrompt.ts precisa ficar igual.
JSON_CODE_BLOCK_INSTRUCTION = """\
FORMATO DA RESPOSTA:
Responda com um bloco de codigo JSON, neste formato:
```json
{ ... }
```
Dentro do bloco, somente JSON valido, sem comentarios.
Nao escreva explicacoes antes ou depois do bloco.
"""


def pedir_resposta_json_em_bloco_codigo(prompt: str) -> str:
    """Acrescenta a instrucao de bloco JSON aos prompts manuais."""
    prompt_limpo = prompt.rstrip()
    instrucao = JSON_CODE_BLOCK_INSTRUCTION.strip()

    if instrucao in prompt_limpo:
        return prompt_limpo

    return f"{prompt_limpo}\n\n{instrucao}"

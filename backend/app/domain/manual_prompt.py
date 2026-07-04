JSON_CODE_BLOCK_INSTRUCTION = """\
INSTRUCAO PARA CHAT EXTERNO:
Esta instrucao substitui qualquer pedido anterior de responder sem markdown ou JSON puro.
Responda em um bloco de codigo JSON, usando exatamente este formato:
```json
{ ... }
```
Dentro do bloco, inclua somente JSON valido, sem comentarios.
Nao escreva explicacoes antes ou depois do bloco.
Ao clicar em copiar no bloco de codigo, o conteudo copiado deve ser diretamente importavel pela aplicacao.
"""


def pedir_resposta_json_em_bloco_codigo(prompt: str) -> str:
    """Acrescenta a instrucao de bloco JSON aos prompts manuais."""
    prompt_limpo = prompt.rstrip()
    instrucao = JSON_CODE_BLOCK_INSTRUCTION.strip()

    if instrucao in prompt_limpo:
        return prompt_limpo

    return f"{prompt_limpo}\n\n{instrucao}"

"""O metadado do corte como a tela o lê (D-722).

As listas (tags, opções de título, opções de texto da capa) ficam gravadas como
JSON, e parte delas vem da resposta da IA sem conferência. Na leitura, cada uma
vira lista de textos: o que não for lista some, e item nulo sai.
"""

import json


def lista_de_textos(gravado: str | None) -> list[str]:
    try:
        valor = json.loads(gravado or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(valor, list):
        return []
    return [item if isinstance(item, str) else str(item) for item in valor if item is not None]

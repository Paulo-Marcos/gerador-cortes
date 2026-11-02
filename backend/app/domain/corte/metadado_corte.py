"""O metadado do corte como a tela o lê (D-722).

As listas (tags, opções de título, opções de texto da capa) ficam gravadas como
JSON, e parte delas vem da resposta da IA sem conferência. Na leitura, cada uma
vira lista de textos: o que não for lista some, e item nulo sai.

Aqui também mora o título que sai para o público (D-1021): o `titulo_proposto`
é a etiqueta da curadoria, e o título de publicação é o gerado no metadado.
"""

import json
import re

from app.domain.corte.reading_metadata import remover_emojis_texto_capa

# Duplicar um corte soma " (2)" ao título: "Corte manual #2 (2) (2)" existe na PROD.
_ROTULO_PROVISORIO = re.compile(r"Corte manual #\d+(?: \(\d+\))*")


def rotulo_de_corte_manual(posicao: int) -> str:
    """O nome de quem nasceu sem título: serve para se achar na lista, não para publicar."""
    return f"Corte manual #{posicao}"


def titulo_de_publicacao(titulo_gerado: str | None, titulo_proposto: str | None) -> str:
    """O título que vai para o público, ou vazio se o corte ainda não tem um (RN-33).

    Vale o gerado, sem o 🔥, que é marca interna. Sem ele, vale o proposto. O
    rótulo provisório nunca vale, e pode estar nos dois campos: ligar o Fire antes
    de gerar copia o proposto para o metadado.

    >>> titulo_de_publicacao("🔥 Por que Hegel?", "Corte manual #3")
    'Por que Hegel?'
    >>> titulo_de_publicacao("", "Hegel de cabeça para baixo")
    'Hegel de cabeça para baixo'
    >>> titulo_de_publicacao("🔥 Corte manual #3", "Corte manual #3")
    ''
    """
    for candidato in (titulo_gerado, titulo_proposto):
        titulo = remover_emojis_texto_capa(candidato or "")
        if titulo and not _ROTULO_PROVISORIO.fullmatch(titulo):
            return titulo
    return ""


def lista_de_textos(gravado: str | None) -> list[str]:
    try:
        valor = json.loads(gravado or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(valor, list):
        return []
    return [item if isinstance(item, str) else str(item) for item in valor if item is not None]

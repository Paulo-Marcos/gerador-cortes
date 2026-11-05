"""O metadado do corte como a tela o lê (D-722).

As listas (tags, opções de título, opções de texto da capa) ficam gravadas como
JSON, e parte delas vem da resposta da IA sem conferência. Na leitura, cada uma
vira lista de textos: o que não for lista some, e item nulo sai.

Aqui também mora o título que sai para o público (D-1021): o `titulo_proposto`
é a etiqueta da curadoria, e o título de publicação é o gerado no metadado.

E o que a geração pode gravar sem pedido de substituir (D-1043): só o que falta.
"""

import json
import re

from app.domain.corte.reading_metadata import (
    remover_emojis_texto_capa,
    remover_prefixo_leitura_titulo,
)

# Duplicar um corte soma " (2)" ao título: "Corte manual #2 (2) (2)" existe na PROD.
_ROTULO_PROVISORIO = re.compile(r"Corte manual #\d+(?: \(\d+\))*")

_CAMPOS_EM_LISTA = {"tags_youtube", "opcoes_titulo", "opcoes_texto_capa"}

# O YouTube só mostra capítulos a partir de três marcas.
_MINIMO_DE_CAPITULOS = 3


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


def formatar_bloco_capitulos(chapters: list | None) -> str:
    """Monta o bloco 'Capítulos:' da descrição a partir dos chapters da IA (D-342).

    Cada item é ``{"inicio": "MM:SS", "titulo": str}``. O YouTube só ativa
    capítulos se o primeiro for ``00:00`` e houver **pelo menos 3** timestamps
    crescentes — então, diante de lista vazia, curta ou malformada, devolvemos
    ``""`` (nenhum bloco) em vez de um bloco quebrado que só polui a descrição.
    """
    if not chapters or len(chapters) < _MINIMO_DE_CAPITULOS:
        return ""
    linhas: list[str] = []
    for cap in chapters:
        if not isinstance(cap, dict):
            return ""
        inicio = str(cap.get("inicio", "")).strip()
        titulo = str(cap.get("titulo", "")).strip()
        if not inicio or not titulo:
            return ""
        linhas.append(f"{inicio} {titulo}")
    if not linhas[0].startswith("00:00"):
        return ""
    return "Capítulos:\n" + "\n".join(linhas)


def lista_de_textos(gravado: str | None) -> list[str]:
    try:
        valor = json.loads(gravado or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(valor, list):
        return []
    return [item if isinstance(item, str) else str(item) for item in valor if item is not None]


def _titulo_foi_escrito(titulo: str | None, titulo_proposto: str | None) -> bool:
    """Se há título de verdade no metadado, e não a cópia do proposto.

    Ligar o Fire antes de gerar copia o proposto para o metadado (RN-33), e essa
    cópia não pode impedir a geração do título. Quem digitar exatamente o proposto
    cai no mesmo caso: os dois textos são iguais, não há como separar.
    """
    limpo = remover_prefixo_leitura_titulo(remover_emojis_texto_capa(titulo or ""))
    if not limpo or _ROTULO_PROVISORIO.fullmatch(limpo):
        return False
    return limpo != remover_emojis_texto_capa(titulo_proposto or "")


def _tem_texto(campo: str, gravado: str | None, titulo_proposto: str | None) -> bool:
    if campo == "titulo_youtube":
        return _titulo_foi_escrito(gravado, titulo_proposto)
    if campo in _CAMPOS_EM_LISTA:
        return bool(lista_de_textos(gravado))
    # O Fire grava o 🔥 na capa ainda vazia: só emoji não é texto.
    return bool(remover_emojis_texto_capa(gravado or ""))


def so_o_que_falta(
    gerados: dict[str, str], gravados: dict[str, str | None], titulo_proposto: str | None
) -> dict[str, str]:
    """Os campos gerados que o metadado ainda não tem: o que já tem texto fica intacto.

    >>> so_o_que_falta(
    ...     {"titulo_youtube": "Da IA", "descricao_youtube": "Da IA"},
    ...     {"titulo_youtube": "Meu título", "descricao_youtube": ""},
    ...     "Proposto",
    ... )
    {'descricao_youtube': 'Da IA'}
    """
    return {
        campo: valor
        for campo, valor in gerados.items()
        if not _tem_texto(campo, gravados.get(campo), titulo_proposto)
    }

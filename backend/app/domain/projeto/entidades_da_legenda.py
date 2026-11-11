"""Entidades HTML da legenda do YouTube — lógica pura, sem I/O.

D-1083: o VTT do YouTube escreve o texto escapado em HTML. A máscara de palavrão
chega como `[&nbsp;__&nbsp;]`, a troca de falante como `&gt;&gt;`, e o `&` como
`&amp;`. Sem decodificar, a tela e a IA leem as entidades ao pé da letra.
"""

import html

# O `&nbsp;` decodificado é o U+00A0: vira espaço comum para a máscara sair
# `[ __ ]`, que é a forma do json3 e a que a fala do trecho já descarta.
_ESPACO_SEM_QUEBRA = " "


def decodificar_entidades_da_legenda(texto: str) -> str:
    """Devolve o texto da legenda com as entidades HTML decodificadas.

    Exemplo:
        >>> decodificar_entidades_da_legenda("não é [&nbsp;__&nbsp;] &gt;&gt; R&amp;D")
        'não é [ __ ] >> R&D'
    """
    return html.unescape(texto).replace(_ESPACO_SEM_QUEBRA, " ")

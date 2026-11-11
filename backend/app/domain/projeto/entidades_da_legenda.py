"""Entidades HTML da legenda do YouTube — lógica pura, sem I/O.

D-1083: o VTT do YouTube escreve o texto escapado em HTML. A máscara de palavrão
chega como `[&nbsp;__&nbsp;]`, a troca de falante como `&gt;&gt;`, e o `&` como
`&amp;`. Sem decodificar, a tela e a IA leem as entidades ao pé da letra.
"""

import html

# O `&nbsp;` decodificado é o U+00A0: vira espaço comum para a máscara sair
# `[ __ ]`, que é a forma do json3 e a que a fala do trecho já descarta.
_ESPACO_SEM_QUEBRA = " "

# O VTT passa por aqui duas vezes (parser e funil da transcrição): decodifica-se até
# o texto parar de mudar, para a segunda passada não mudar nada. O limite só protege
# de um texto absurdo; entidade escapada além disso fica como está.
_PASSADAS_MAXIMAS = 5


def decodificar_entidades_da_legenda(texto: str) -> str:
    """Devolve o texto da legenda com as entidades HTML decodificadas; é idempotente.

    Exemplo:
        >>> decodificar_entidades_da_legenda("não é [&nbsp;__&nbsp;] &gt;&gt; R&amp;amp;D")
        'não é [ __ ] >> R&D'
    """
    for _ in range(_PASSADAS_MAXIMAS):
        decodificado = html.unescape(texto)
        if decodificado == texto:
            break
        texto = decodificado
    return texto.replace(_ESPACO_SEM_QUEBRA, " ")

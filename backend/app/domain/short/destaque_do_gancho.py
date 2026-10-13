"""O trecho em destaque do gancho, marcado entre asteriscos (D-913).

O operador escreve "Nietzsche não pedia *Game of Thrones*", e o render pinta o
trecho marcado no acento do canal. A marca mora no PRÓPRIO texto do gancho —
apagou a palavra, apagou a marca — e quem desenha é o renderer
(`video-renderer/src/cenas-shorts/destaqueDoGancho.tsx`, que este módulo espelha).

Aqui fica o que o backend precisa: tirar as marcas onde o gancho aparece sem
cor (o texto da capa, os prompts de metadados) e saber qual é o trecho.

Sem I/O.
"""

from __future__ import annotations

import re

MARCA = "*"
_ESPACOS = re.compile(r"\s+")


def trecho_destacado(texto: str) -> str:
    """O trecho do primeiro par de marcas, ou vazio quando não há par válido.

    Exemplos:
        >>> trecho_destacado("Nietzsche não pedia *Game of Thrones*")
        'Game of Thrones'
        >>> trecho_destacado("sem marca nenhuma")
        ''
        >>> trecho_destacado("marca *solta")
        ''
        >>> trecho_destacado("par ** vazio")
        ''
    """
    texto = texto or ""
    abre = texto.find(MARCA)
    if abre < 0:
        return ""
    fecha = texto.find(MARCA, abre + 1)
    if fecha < 0:
        return ""
    return texto[abre + 1 : fecha].strip()


def sem_marcas(texto: str) -> str:
    """O gancho como se lê, sem os asteriscos do destaque.

    Exemplos:
        >>> sem_marcas("Nietzsche não pedia *Game of Thrones*")
        'Nietzsche não pedia Game of Thrones'
        >>> sem_marcas("  * solto  ")
        'solto'
        >>> sem_marcas("")
        ''
    """
    return _ESPACOS.sub(" ", (texto or "").replace(MARCA, "")).strip()

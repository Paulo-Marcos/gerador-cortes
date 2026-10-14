"""D-913: o trecho em destaque do gancho, marcado entre asteriscos."""

from __future__ import annotations

import pytest
from app.domain.short.destaque_do_gancho import sem_marcas, trecho_destacado


@pytest.mark.parametrize(
    ("texto", "trecho"),
    [
        ("Nietzsche não pedia *Game of Thrones*", "Game of Thrones"),
        ("*Ninguém* te conta isso", "Ninguém"),
        ("sem marca nenhuma", ""),
        ("marca *solta", ""),
        ("par ** vazio", ""),
        ("", ""),
    ],
)
def test_trecho_destacado(texto, trecho):
    assert trecho_destacado(texto) == trecho


def test_sem_marcas_e_o_gancho_como_se_le():
    assert (
        sem_marcas("Nietzsche não pedia *Game of Thrones*") == "Nietzsche não pedia Game of Thrones"
    )
    assert sem_marcas("  *  solto  ") == "solto"


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("*ninguém* te conta isso", "*Ninguém* te conta isso"),
        ("  *  game of thrones* sem pedir", "* Game of thrones* sem pedir"),
        ("o *juro* trabalha contra", "O *juro* trabalha contra"),
        ("*", "*"),
    ],
)
def test_maiuscula_pula_a_marca_do_destaque_d919(texto, esperado):
    """D-919: o gancho que começa pelo destaque também abre com maiúscula."""
    from app.domain.short.gancho_short import normalizar_gancho

    assert normalizar_gancho(texto) == esperado

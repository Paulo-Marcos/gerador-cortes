"""D-987: em qual rede os cortes horizontais da live já estão inteiros.

O sinal convida o operador a ESQUECER a live. Errar para cima (acender com
corte ainda por subir) deixa um vídeo fora do ar sem ninguém olhando; errar
para baixo devolve a conferência corte a corte, que é o problema que a
demanda veio resolver.
"""

from __future__ import annotations

from app.domain.projeto.redes_do_projeto import redes_do_projeto


def _por_rede(redes: list[dict]) -> dict[str, dict]:
    return {rede["plataforma"]: rede for rede in redes}


def test_devolve_as_duas_redes_do_horizontal_na_ordem_da_tela():
    redes = redes_do_projeto(0, {})

    assert [r["plataforma"] for r in redes] == ["youtube", "tiktok_horizontal"]


def test_sem_corte_pronto_nenhuma_rede_acende():
    redes = _por_rede(redes_do_projeto(0, {}))

    assert all(not r["completa"] for r in redes.values())
    assert all(r["publicados"] == 0 for r in redes.values())


def test_acende_so_a_rede_onde_todos_os_prontos_subiram():
    redes = _por_rede(redes_do_projeto(3, {"youtube": 3, "tiktok_horizontal": 1}))

    assert redes["youtube"] == {"plataforma": "youtube", "publicados": 3, "completa": True}
    assert redes["tiktok_horizontal"]["completa"] is False
    assert redes["tiktok_horizontal"]["publicados"] == 1


def test_a_rede_do_short_nao_entra_no_card_da_live():
    """O `tiktok` do enum é o short vertical (D-470); o 16:9 é o horizontal."""
    redes = _por_rede(redes_do_projeto(1, {"tiktok": 1, "youtube_shorts": 1}))

    assert set(redes) == {"youtube", "tiktok_horizontal"}
    assert all(not r["completa"] for r in redes.values())

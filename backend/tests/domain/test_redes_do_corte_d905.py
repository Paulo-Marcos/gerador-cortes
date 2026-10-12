"""D-905: em qual rede um corte já está INTEIRO — o ícone aceso no cartão.

A regra decide o que o operador lê como "pode finalizar". Errar para cima
(acender sem estar tudo no ar) tira um corte da fila com short esquecido fora
de uma rede; errar para baixo deixa o operador conferindo short a short — o
problema que a demanda veio resolver.
"""

from __future__ import annotations

from app.domain.short.shorts_prontos import redes_do_corte


def _por_rede(redes: list[dict]) -> dict[str, dict]:
    return {rede["plataforma"]: rede for rede in redes}


def test_devolve_as_tres_redes_do_short_na_ordem_da_tela():
    redes = redes_do_corte(0, {})

    assert [r["plataforma"] for r in redes] == ["youtube_shorts", "tiktok", "instagram_reels"]


def test_sem_short_pronto_nenhuma_rede_acende():
    redes = _por_rede(redes_do_corte(0, {}))

    assert all(not r["completa"] for r in redes.values())
    assert all(r["publicados"] == 0 for r in redes.values())


def test_acende_so_a_rede_onde_todos_os_prontos_subiram():
    redes = _por_rede(redes_do_corte(2, {"tiktok": 2, "youtube_shorts": 1}))

    assert redes["tiktok"] == {"plataforma": "tiktok", "publicados": 2, "completa": True}
    assert redes["youtube_shorts"]["completa"] is False
    assert redes["youtube_shorts"]["publicados"] == 1
    assert redes["instagram_reels"]["completa"] is False


def test_tiktok_horizontal_do_corte_nao_conta_como_rede_do_short():
    redes = _por_rede(redes_do_corte(1, {"tiktok_horizontal": 1}))

    assert "tiktok_horizontal" not in redes
    assert redes["tiktok"]["completa"] is False

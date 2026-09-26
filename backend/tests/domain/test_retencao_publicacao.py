"""O que a limpeza pode apagar (RN-16) e o que o Fire guarda (RN-15).

As duas regras eram testadas só de passagem, pelo serviço de retenção — e os
exemplos do módulo são doctests, que a suíte não roda. Aqui elas são testadas
como regras: sem disco, só a decisão (D-710).
"""

import pytest
from app.domain.publicacao.retencao_publicacao import (
    NADA_GUARDADO,
    DestinoDoCorte,
    GuardaDoFire,
    o_que_o_fire_guarda,
    pode_apagar_o_mp4,
)

YT_OK = DestinoDoCorte("YouTube", publicado=True)
TK_OK = DestinoDoCorte("TikTok", publicado=True)
TK_PENDENTE = DestinoDoCorte("TikTok", publicado=False)


# ─── RN-16: o MP4 só sai quando todos publicaram ─────────────────────────────


def test_todos_os_destinos_publicados_liberam_o_mp4():
    veredito = pode_apagar_o_mp4([YT_OK, TK_OK])

    assert veredito.liberado and veredito.motivo == "todos os destinos publicados"


def test_um_destino_pendente_segura_o_mp4_e_diz_qual():
    veredito = pode_apagar_o_mp4([YT_OK, TK_PENDENTE])

    assert not veredito.liberado
    assert veredito.motivo == "ainda falta publicar em: TikTok"


def test_sem_destino_conhecido_o_mp4_fica():
    assert pode_apagar_o_mp4([]).liberado is False


# ─── RN-15: o que o Fire guarda na limpeza ──────────────────────────────────


def _guarda(*, e_fire=True, tem_bruto=True, shorts_finalizados=False, destinos=(YT_OK,)):
    return o_que_o_fire_guarda(
        e_fire=e_fire,
        tem_bruto=tem_bruto,
        shorts_finalizados=shorts_finalizados,
        destinos=list(destinos),
    )


def test_fire_pendente_guarda_bruto_e_shorts_e_o_mp4_so_se_falta_destino():
    assert _guarda(destinos=[YT_OK, TK_OK]) == GuardaDoFire(bruto=True, shorts=True, mp4=False)
    assert _guarda(destinos=[YT_OK, TK_PENDENTE]) == GuardaDoFire(bruto=True, shorts=True, mp4=True)


@pytest.mark.parametrize(
    "campos",
    [
        {"e_fire": False},
        {"tem_bruto": False},
        {"shorts_finalizados": True},
    ],
    ids=["corte-comum", "fire-sem-bruto", "shorts-finalizados"],
)
def test_sem_fire_pendente_nada_fica_guardado(campos):
    assert _guarda(destinos=[TK_PENDENTE], **campos) == NADA_GUARDADO

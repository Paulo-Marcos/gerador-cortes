"""D-1089 (P10, RN-36): o trecho ajustado à mão volta à borda da IA e à rodada."""

from __future__ import annotations

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.time_convert import seg_to_hms
from app.domain.corte.riscados import (
    carimbar_rodada,
    desfazer_rodada,
    trechos_da_ultima_rodada,
    voltar_a_borda_da_ia,
)


def _marca(ini: float, fim: float, **campos) -> dict:
    return {
        "inicio_seg": ini,
        "fim_seg": fim,
        "inicio_hms": seg_to_hms(ini),
        "fim_hms": seg_to_hms(fim),
        "motivo": f"m{ini}",
        **campos,
    }


def _ajustada(marca: dict, ini: float, fim: float) -> dict:
    """Como o arraste grava: muda o HMS e os segundos, e o carimbo fica."""
    return {**marca, **_marca(ini, fim, motivo=marca["motivo"])}


def test_volta_as_bordas_do_carimbo_e_o_trecho_entra_de_novo_no_desfazer():
    da_ia = carimbar_rodada(_marca(16.5, 18.25, origem="claude", categoria="tangente"), 2)
    mexida = _ajustada(da_ia, 17.0, 19.0)
    assert trechos_da_ultima_rodada([mexida]) == 0

    desvios = voltar_a_borda_da_ia([_marca(5, 6), mexida], 1)

    assert desvios[0] == _marca(5, 6)
    volta = desvios[1]
    assert (volta["inicio_seg"], volta["fim_seg"]) == (16.5, 18.25)
    assert (volta["inicio_hms"], volta["fim_hms"]) == ("00:00:16.500", "00:00:18.250")
    # O resto da marca é o mesmo: motivo, origem, categoria, rodada e o próprio carimbo.
    assert volta["motivo"] == da_ia["motivo"]
    assert volta["origem"] == "claude"
    assert volta["categoria"] == "tangente"
    assert volta["rodada"] == 2
    assert volta["borda_da_rodada"] == [16.5, 18.25]
    assert trechos_da_ultima_rodada(desvios) == 1
    fica, sai, rodada = desfazer_rodada(desvios, [])
    assert rodada == 2
    assert [d["inicio_seg"] for d in sai] == [16.5]
    assert fica == [_marca(5, 6)]


def test_formato_antigo_com_inicio_e_fim_tambem_volta():
    da_ia = carimbar_rodada(_marca(10, 12), 1)
    legado = {**da_ia, "inicio": "00:00:11", "fim": "00:00:13"}
    legado.pop("inicio_hms")
    legado.pop("fim_hms")

    volta = voltar_a_borda_da_ia([legado], 0)[0]

    assert (volta["inicio_seg"], volta["fim_seg"]) == (10, 12)
    assert "inicio" not in volta and "fim" not in volta


def test_trecho_marcado_a_mao_nao_tem_borda_para_voltar():
    with pytest.raises(PedidoInvalido, match="não veio de uma rodada"):
        voltar_a_borda_da_ia([_marca(5, 6, origem="manual")], 0)


@pytest.mark.parametrize("indice", [-1, 1])
def test_indice_fora_da_lista_e_pedido_invalido(indice):
    with pytest.raises(PedidoInvalido, match="não existe mais"):
        voltar_a_borda_da_ia([carimbar_rodada(_marca(5, 6), 1)], indice)

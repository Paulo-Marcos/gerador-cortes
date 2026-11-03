"""D-1017 (RN-36): o que sai fica visível e volta; a rodada da IA se desfaz inteira."""

from __future__ import annotations

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.time_convert import seg_to_hms
from app.domain.corte.ancora_match import RECUSA_CITACAO_NAO_CONFERE
from app.domain.corte.riscados import (
    carimbar_rodada,
    desfazer_rodada,
    novos_sem_os_riscados,
    restaurar,
    riscados_pelo_operador,
    riscar,
    separar_por_citacao,
    trechos_da_ultima_rodada,
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


def test_riscar_muda_a_marca_de_lista_sem_perder_nada():
    a, b = _marca(10, 12, origem="claude"), _marca(20, 22)
    desvios, riscados = riscar([a, b], [_marca(5, 6)], 0)
    assert desvios == [b]
    assert [r["inicio_seg"] for r in riscados] == [5, 10]
    assert riscados[1]["origem"] == "claude"


def test_restaurar_devolve_na_ordem_do_tempo_e_tira_a_recusa():
    desvios, riscados = restaurar(
        [_marca(30, 31)], [_marca(10, 12, recusa=RECUSA_CITACAO_NAO_CONFERE, motivo="x")], 0
    )
    assert riscados == []
    assert [d["inicio_seg"] for d in desvios] == [10, 30]
    assert "recusa" not in desvios[0]
    assert desvios[0]["motivo"] == "x"


@pytest.mark.parametrize("indice", [-1, 1])
def test_indice_de_riscado_invalido_e_recusado(indice):
    with pytest.raises(PedidoInvalido):
        restaurar([], [_marca(1, 2)], indice)


def test_desfazer_leva_so_a_ultima_rodada():
    r1 = carimbar_rodada(_marca(10, 12), 1)
    r2 = carimbar_rodada(_marca(20, 22), 2)
    r2b = carimbar_rodada(_marca(30, 32), 2)
    mao = _marca(40, 42, origem="manual")

    desvios, riscados, numero = desfazer_rodada([r1, r2, mao, r2b], [])

    assert numero == 2
    assert desvios == [r1, mao]
    assert riscados == [r2, r2b]


def test_desfazer_de_novo_chega_na_rodada_anterior():
    r1 = carimbar_rodada(_marca(10, 12), 1)
    r2 = carimbar_rodada(_marca(20, 22), 2)
    desvios, riscados, _ = desfazer_rodada([r1, r2], [])
    desvios, riscados, numero = desfazer_rodada(desvios, riscados)
    assert numero == 1
    assert desvios == []
    assert [r["inicio_seg"] for r in riscados] == [10, 20]


def test_marca_que_o_operador_ajustou_nao_sai_com_a_rodada():
    intacta = carimbar_rodada(_marca(10, 12), 1)
    ajustada = carimbar_rodada(_marca(20, 22), 1)
    # A tela muda só o HMS ao arrastar a borda: `inicio_seg` fica para trás.
    ajustada = {**ajustada, "fim_hms": seg_to_hms(23.5)}

    desvios, riscados, _ = desfazer_rodada([intacta, ajustada], [])

    assert desvios == [ajustada]
    assert riscados == [intacta]


def test_sem_rodada_para_desfazer_e_recusado():
    with pytest.raises(PedidoInvalido):
        desfazer_rodada([_marca(1, 2, origem="manual")], [])


def test_a_tela_sabe_quantos_trechos_saem_ao_desfazer():
    assert trechos_da_ultima_rodada([]) == 0
    assert trechos_da_ultima_rodada([_marca(1, 2, origem="manual")]) == 0
    r1 = carimbar_rodada(_marca(10, 12), 1)
    r2 = carimbar_rodada(_marca(20, 22), 2)
    r2b = carimbar_rodada(_marca(30, 32), 2)
    assert trechos_da_ultima_rodada([r1, r2, r2b]) == 2


def test_separar_por_citacao_guarda_o_motivo_da_recusa():
    palavras = [{"texto": p, "inicio_seg": 10.0 + i} for i, p in enumerate("ola mundo".split())]
    certa = _marca(10, 11, inicio_texto="ola mundo")
    falsa = _marca(10, 11, inicio_texto="ninguem disse isso")
    sem_citacao = _marca(10, 11)

    aceitos, recusados = separar_por_citacao([certa, falsa, sem_citacao], palavras)

    assert aceitos == [certa, sem_citacao]
    assert recusados == [{**falsa, "recusa": RECUSA_CITACAO_NAO_CONFERE}]


def test_o_que_o_operador_riscou_nao_volta_na_proxima_rodada():
    riscada = _marca(10, 12)
    recusada = _marca(50, 52, recusa=RECUSA_CITACAO_NAO_CONFERE)
    nova = _marca(30, 32)
    de_novo = _marca(10, 12)
    corrigida = _marca(50, 52)

    assert riscados_pelo_operador([riscada, recusada]) == [riscada]
    assert novos_sem_os_riscados([de_novo, nova, corrigida], [riscada, recusada]) == [
        nova,
        corrigida,
    ]

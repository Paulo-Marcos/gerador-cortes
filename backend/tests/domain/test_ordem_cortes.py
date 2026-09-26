"""D-448: ordem canônica dos cortes — cronológica por padrão, pin como exceção."""

import pytest
from app.domain.corte.ordem_cortes import CorteOrdenavel, ordenar_por_tempo, pins_para_ordem


def _c(id_: str, inicio: float, pin: int | None = None) -> CorteOrdenavel:
    return CorteOrdenavel(id=id_, inicio_seg=inicio, posicao_fixada=pin)


def test_ordena_pelo_tempo_ignorando_a_ordem_de_chegada():
    # A ordem da lista é a de criação; a saída tem de ser a da live.
    itens = [_c("do-desvio", 120.0), _c("primeiro", 10.0), _c("segundo", 80.0)]

    assert ordenar_por_tempo(itens) == ["primeiro", "segundo", "do-desvio"]


def test_lista_vazia():
    assert ordenar_por_tempo([]) == []


def test_pin_tira_o_corte_do_lugar_cronologico():
    itens = [_c("a", 10.0), _c("b", 20.0), _c("c", 30.0, pin=1)]

    assert ordenar_por_tempo(itens) == ["c", "a", "b"]


def test_nao_fixados_continuam_em_ordem_de_tempo_ao_redor_do_pin():
    itens = [_c("tarde", 300.0), _c("cedo", 5.0), _c("fixo", 100.0, pin=2)]

    assert ordenar_por_tempo(itens) == ["cedo", "fixo", "tarde"]


def test_pins_colididos_nao_derrubam_a_lista():
    # Cenário real: um corte do meio é deletado e dois pins passam a apontar
    # para a mesma posição. O segundo escorrega para o slot seguinte.
    itens = [_c("a", 10.0, pin=1), _c("b", 20.0, pin=1), _c("c", 30.0)]

    assert ordenar_por_tempo(itens) == ["a", "b", "c"]


def test_pin_acima_do_tamanho_da_lista_vai_para_o_fim():
    itens = [_c("a", 10.0), _c("b", 20.0, pin=99)]

    assert ordenar_por_tempo(itens) == ["a", "b"]


def test_pins_para_ordem_fixa_so_o_minimo_necessario():
    itens = [_c("a", 10.0), _c("b", 20.0), _c("c", 30.0)]

    # Mover "c" para o topo desloca a,b — mas a,b continuam em ordem de tempo
    # entre si, então só "c" precisa de pin. Fixar os três engessaria a lista.
    assert pins_para_ordem(itens, ["c", "a", "b"]) == {"c": 1, "a": None, "b": None}


def test_pins_para_ordem_limpa_o_pin_de_quem_voltou_ao_tempo():
    itens = [_c("a", 10.0, pin=2), _c("b", 20.0, pin=1)]

    assert pins_para_ordem(itens, ["a", "b"]) == {"a": None, "b": None}


def test_pins_para_ordem_reproduz_a_ordem_pedida():
    itens = [_c("a", 10.0), _c("b", 20.0), _c("c", 30.0), _c("d", 40.0)]
    desejada = ["b", "a", "c", "d"]

    pins = pins_para_ordem(itens, desejada)
    aplicados = [
        CorteOrdenavel(id=c.id, inicio_seg=c.inicio_seg, posicao_fixada=pins[c.id]) for c in itens
    ]

    assert ordenar_por_tempo(aplicados) == desejada


@pytest.mark.parametrize("desejada", [["c", "b", "a"], ["a", "c", "b"], ["b", "c", "a"]])
def test_qualquer_ordem_pedida_e_reproduzivel(desejada):
    itens = [_c("a", 10.0), _c("b", 20.0), _c("c", 30.0)]

    pins = pins_para_ordem(itens, desejada)
    aplicados = [
        CorteOrdenavel(id=c.id, inicio_seg=c.inicio_seg, posicao_fixada=pins[c.id]) for c in itens
    ]

    assert ordenar_por_tempo(aplicados) == desejada

"""D-576: ordem de exibição dos blocos de um corte.

O teste que mais importa aqui é o primeiro: **corte sem arranjo tem que sair
exatamente como saía antes desta demanda.** Todo o resto é ganho; esse é o piso.
"""

from app.domain.corte import arranjo_blocos as arranjo
from app.domain.corte.arranjo_blocos import Bloco
from app.domain.corte.segment_calculator import calcular_segmentos

SILENCIO = [{"inicio_seg": 100.0, "fim_seg": 150.0}]


# ─────────────────────────────────────────────────────────────────────────────
# Não-regressão: o caminho de antes do D-576
# ─────────────────────────────────────────────────────────────────────────────


def test_sem_arranjo_e_identico_ao_calculo_cronologico():
    assert arranjo.segmentos_na_ordem([], 0, 480, SILENCIO) == calcular_segmentos(0, 480, SILENCIO)


def test_sem_arranjo_e_identico_tambem_sem_desvio():
    assert arranjo.segmentos_na_ordem([], 0, 480, []) == calcular_segmentos(0, 480, [])


def test_dividir_sem_mover_nao_muda_um_frame():
    """A junta existe no modelo, mas o vídeo continua uma peça só."""
    blocos = arranjo.dividir([], 180, 0, 480)
    blocos = arranjo.dividir(blocos, 300, 0, 480)

    assert len(blocos) == 3
    assert arranjo.segmentos_na_ordem(blocos, 0, 480, SILENCIO) == calcular_segmentos(
        0, 480, SILENCIO
    )


# ─────────────────────────────────────────────────────────────────────────────
# O gesto da demanda: trocar a ordem
# ─────────────────────────────────────────────────────────────────────────────


def test_o_caso_do_paulo_tres_finais_para_o_comeco():
    """Corte de 8 min: [A 0-3][B 3-5][C 5-8] vira [C][A][B]."""
    blocos = arranjo.dividir(arranjo.dividir([], 180, 0, 480), 300, 0, 480)
    blocos = arranjo.mover(blocos, 2, 0)  # C para o começo

    assert [b.inicio_seg for b in blocos] == [300.0, 0.0, 180.0]
    assert arranjo.segmentos_na_ordem(blocos, 0, 480, []) == [
        {"start": 300.0, "end": 480.0},
        {"start": 0.0, "end": 300.0},  # A e B voltaram a ser contíguos: costurados
    ]


def test_ordem_trocada_nao_muda_a_duracao_total():
    blocos = arranjo.mover(arranjo.dividir([], 180, 0, 480), 1, 0)
    total = sum(s["end"] - s["start"] for s in arranjo.segmentos_na_ordem(blocos, 0, 480, []))
    assert total == 480.0


def test_desvio_acompanha_o_bloco_que_se_moveu():
    """O silêncio em 100-150 mora no bloco A; A indo para o fim, o buraco vai junto."""
    blocos = arranjo.mover(arranjo.dividir([], 180, 0, 480), 0, 1)

    assert arranjo.segmentos_na_ordem(blocos, 0, 480, SILENCIO) == [
        {"start": 180.0, "end": 480.0},
        {"start": 0.0, "end": 100.0},
        {"start": 150.0, "end": 180.0},
    ]


def test_bloco_inteiramente_removido_por_desvio_some():
    """Sem `fallback=False` por bloco, ele ressuscitaria bem onde foi removido."""
    blocos = arranjo.dividir([], 180, 0, 480)
    desvios = [{"inicio_seg": 0.0, "fim_seg": 180.0}]

    assert arranjo.segmentos_na_ordem(blocos, 0, 480, desvios) == [{"start": 180.0, "end": 480.0}]


def test_corte_todo_removido_ainda_devolve_algo():
    """Rede de segurança do corte: o export nunca pode receber lista vazia."""
    blocos = arranjo.dividir([], 180, 0, 480)
    desvios = [{"inicio_seg": 0.0, "fim_seg": 480.0}]

    assert arranjo.segmentos_na_ordem(blocos, 0, 480, desvios) == [{"start": 0.0, "end": 480.0}]


# ─────────────────────────────────────────────────────────────────────────────
# Operações
# ─────────────────────────────────────────────────────────────────────────────


def test_dividir_em_ponto_fora_do_corte_nao_faz_nada():
    assert arranjo.dividir([Bloco(0, 480)], 900, 0, 480) == [Bloco(0, 480)]


def test_dividir_rente_a_borda_nao_cria_micro_bloco():
    assert arranjo.dividir([Bloco(0, 480)], 0.02, 0, 480) == [Bloco(0, 480)]


def test_mover_com_indice_invalido_devolve_intacto():
    blocos = [Bloco(0, 180), Bloco(180, 480)]
    assert arranjo.mover(blocos, 5, 0) == blocos


def test_fundir_junta_o_vizinho_da_live_e_nao_o_da_lista():
    """[C][A][B]: fundir A tem que colar A+B, que são vizinhos na live."""
    blocos = [Bloco(300, 480), Bloco(0, 180), Bloco(180, 300)]
    fundido = arranjo.fundir(blocos, 1)

    assert fundido == [Bloco(300, 480), Bloco(0, 300)]


def test_fundir_bloco_final_da_live_nao_tem_vizinho():
    blocos = [Bloco(0, 180), Bloco(180, 480)]
    assert arranjo.fundir(blocos, 1) == blocos


def test_eh_cronologico_distingue_fatiado_de_reordenado():
    fatiado = arranjo.dividir([], 180, 0, 480)
    assert arranjo.eh_cronologico([]) is True
    assert arranjo.eh_cronologico(fatiado) is True
    assert arranjo.eh_cronologico(arranjo.mover(fatiado, 1, 0)) is False


# ─────────────────────────────────────────────────────────────────────────────
# Reconciliação: o corte mexeu embaixo do arranjo
# ─────────────────────────────────────────────────────────────────────────────


def test_reconciliar_preserva_a_ordem_ao_encolher_o_fim():
    blocos = [Bloco(300, 480), Bloco(0, 180), Bloco(180, 300)]
    novo = arranjo.reconciliar(blocos, 0, 400)

    assert novo == [Bloco(300, 400), Bloco(0, 180), Bloco(180, 300)]
    assert arranjo.validar(novo, 0, 400) == []


def test_reconciliar_estica_para_cobrir_borda_que_cresceu():
    novo = arranjo.reconciliar([Bloco(0, 180), Bloco(180, 480)], 0, 600)

    assert arranjo.validar(novo, 0, 600) == []
    assert novo[-1].fim_seg == 600.0


def test_reconciliar_descarta_bloco_que_ficou_fora():
    novo = arranjo.reconciliar([Bloco(0, 180), Bloco(180, 480)], 200, 480)

    assert novo == [Bloco(200, 480)]
    assert arranjo.validar(novo, 200, 480) == []


def test_reconciliar_de_arranjo_vazio_continua_vazio():
    assert arranjo.reconciliar([], 0, 480) == []


def test_reconciliar_sempre_devolve_arranjo_valido():
    """Invariante: seja qual for a borda nova, o resultado ladrilha o intervalo."""
    blocos = [Bloco(300, 480), Bloco(0, 180), Bloco(180, 300)]
    for inicio, fim in ((0, 480), (0, 250), (100, 480), (170, 310), (0, 900)):
        assert arranjo.validar(arranjo.reconciliar(blocos, inicio, fim), inicio, fim) == []


# ─────────────────────────────────────────────────────────────────────────────
# Junção de cortes (D-575 encontra D-576)
# ─────────────────────────────────────────────────────────────────────────────


def test_juntar_dois_cortes_cronologicos_nao_inventa_arranjo():
    assert arranjo.concatenar([], [], 0, 300, 300, 600) == []


def test_juncao_preserva_a_ordem_de_cada_metade():
    """O primeiro corte toca inteiro (na ordem dele), depois o segundo."""
    esquerda = [Bloco(180, 300), Bloco(0, 180)]  # invertido
    direita = [Bloco(300, 480), Bloco(480, 600)]  # cronológico

    junto = arranjo.concatenar(esquerda, direita, 0, 300, 300, 600)

    assert junto == [Bloco(180, 300), Bloco(0, 180), Bloco(300, 480), Bloco(480, 600)]
    assert arranjo.validar(junto, 0, 600) == []


def test_juncao_com_vao_entre_os_cortes_ladrilha_o_span():
    """O vão vira bloco para a invariante fechar; some do vídeo pelo desvio."""
    junto = arranjo.concatenar([Bloco(180, 300), Bloco(0, 180)], [], 0, 300, 400, 600)

    assert arranjo.validar(junto, 0, 600) == []
    assert Bloco(300, 400) in junto


def test_juncao_materializa_a_metade_que_nao_tinha_arranjo():
    junto = arranjo.concatenar([], [Bloco(480, 600), Bloco(300, 480)], 0, 300, 300, 600)

    assert junto == [Bloco(0, 300), Bloco(480, 600), Bloco(300, 480)]
    assert arranjo.validar(junto, 0, 600) == []


# ─────────────────────────────────────────────────────────────────────────────
# Validação e leitura
# ─────────────────────────────────────────────────────────────────────────────


def test_validar_aceita_permutacao_completa():
    assert arranjo.validar([Bloco(300, 480), Bloco(0, 300)], 0, 480) == []


def test_validar_acusa_buraco():
    assert arranjo.validar([Bloco(0, 100), Bloco(200, 480)], 0, 480) != []


def test_validar_acusa_sobreposicao():
    assert arranjo.validar([Bloco(0, 300), Bloco(200, 480)], 0, 480) != []


def test_validar_acusa_bloco_fora_do_corte():
    assert arranjo.validar([Bloco(0, 480), Bloco(480, 600)], 0, 480) != []


def test_parse_trata_lixo_como_ausencia():
    assert arranjo.parse("nao e json") == []
    assert arranjo.parse(None) == []
    assert arranjo.parse([{"inicio_seg": 10}]) == []
    assert arranjo.parse([{"inicio_seg": 10, "fim_seg": 10.01}]) == []


def test_parse_preserva_a_ordem_persistida():
    bruto = '[{"inicio_seg": 300, "fim_seg": 480}, {"inicio_seg": 0, "fim_seg": 300}]'
    assert arranjo.parse(bruto) == [Bloco(300, 480), Bloco(0, 300)]


def test_serializar_e_parse_sao_inversos():
    blocos = [Bloco(300, 480), Bloco(0, 300)]
    assert arranjo.parse(arranjo.serializar(blocos)) == blocos


def test_duracao_liquida_desconta_o_desvio_do_bloco():
    assert arranjo.duracao_liquida(Bloco(0, 180), SILENCIO) == 130.0
    assert arranjo.duracao_liquida(Bloco(180, 480), SILENCIO) == 300.0

"""D-447: material e contrato da avaliação automática do bruto."""

import pytest
from app.domain.avaliacao_bruto import (
    Emenda,
    calcular_emendas,
    montar_texto_avaliado,
    normalizar_avaliacao,
    rotulo_do_tipo,
)

# ─── emendas ─────────────────────────────────────────────────────────────────


def test_corte_sem_remocao_nao_tem_emenda():
    assert calcular_emendas([{"start": 0.0, "end": 60.0}], []) == []


def test_emenda_cai_na_timeline_do_bruto_nao_na_da_live():
    # Mantidos 10-40 e 70-90: no bruto a costura fica aos 30s (não aos 40s).
    emendas = calcular_emendas(
        [{"start": 10.0, "end": 40.0}, {"start": 70.0, "end": 90.0}],
        [{"inicio_seg": 40.0, "fim_seg": 70.0, "motivo": "papo com o chat"}],
    )

    assert len(emendas) == 1
    assert emendas[0].posicao_seg == 30.0
    assert emendas[0].removido_seg == 30.0
    assert emendas[0].motivo == "papo com o chat"


def test_emenda_sem_desvio_correspondente_fica_sem_motivo():
    emendas = calcular_emendas([{"start": 0.0, "end": 10.0}, {"start": 20.0, "end": 30.0}], [])

    assert emendas[0].motivo == ""


def test_segmentos_fora_de_ordem_sao_a_ordem_de_exibicao():
    # D-576 inverteu este contrato. Ordenar antes de costurar era seguro enquanto
    # "fora de ordem" só podia ser engano do chamador; com o arranjo de blocos
    # virou a informação — o vídeo toca [70-90] e só depois [10-40].
    emendas = calcular_emendas([{"start": 70.0, "end": 90.0}, {"start": 10.0, "end": 40.0}], [])

    # A emenda cai aos 20s do bruto (a duração do primeiro bloco na fila).
    assert [e.posicao_seg for e in emendas] == [20.0]


def test_bloco_movido_nao_conta_como_tempo_removido():
    """O que mudou de lugar não sumiu — contá-lo inflaria a telemetria do corte."""
    emendas = calcular_emendas([{"start": 300.0, "end": 480.0}, {"start": 0.0, "end": 300.0}], [])

    assert emendas[0].removido_seg == 0.0
    assert emendas[0].motivo == "ordem trocada pelo editor"


def test_vao_com_material_que_toca_adiante_e_reordenacao_e_nao_corte():
    """[A][C] com B jogado para o fim: o vão entre A e C não é remoção."""
    emendas = calcular_emendas(
        [
            {"start": 0.0, "end": 180.0},
            {"start": 300.0, "end": 480.0},
            {"start": 180.0, "end": 300.0},
        ],
        [],
    )

    assert emendas[0].removido_seg == 0.0
    assert emendas[1].removido_seg == 0.0


# ─── texto avaliado ──────────────────────────────────────────────────────────


def test_texto_marca_a_emenda_entre_as_falas_vizinhas():
    texto = montar_texto_avaliado(
        [
            {"start": 0.0, "texto": "antes da costura"},
            {"start": 30.0, "texto": "depois da costura"},
        ],
        [Emenda(posicao_seg=30.0, removido_seg=12.0, motivo="digressão")],
    )
    linhas = texto.splitlines()

    assert linhas[0] == "[00:00] antes da costura"
    assert "EMENDA 1" in linhas[1]
    assert "digressão" in linhas[1]
    assert linhas[2] == "[00:30] depois da costura"


def test_emenda_depois_da_ultima_fala_ainda_aparece():
    texto = montar_texto_avaliado(
        [{"start": 0.0, "texto": "única fala"}],
        [Emenda(posicao_seg=99.0, removido_seg=5.0, motivo="")],
    )

    assert texto.splitlines()[-1].startswith("─── EMENDA 1")


def test_segmento_sem_texto_nao_vira_linha_vazia():
    texto = montar_texto_avaliado(
        [{"start": 0.0, "texto": "  "}, {"start": 5.0, "texto": "vale"}], []
    )

    assert texto == "[00:05] vale"


# ─── contrato de saída ───────────────────────────────────────────────────────


def test_avaliacao_completa_e_normalizada():
    avaliacao = normalizar_avaliacao(
        {
            "nota": 4,
            "veredito": "COESA",
            "parecer": "  flui bem  ",
            "apontamentos": [
                {
                    "tipo": "contexto_perdido",
                    "gravidade": "GRAVE",
                    "momento": "01:20",
                    "descricao": "a resposta chega sem a pergunta",
                }
            ],
        }
    )

    assert avaliacao.nota == 4
    assert avaliacao.veredito == "coesa"
    assert avaliacao.parecer == "flui bem"
    assert avaliacao.apontamentos[0]["gravidade"] == "grave"


def test_nota_ausente_derruba_a_avaliacao():
    # Gravar nota inventada contaminaria a estatística que motiva a feature.
    with pytest.raises(ValueError):
        normalizar_avaliacao({"veredito": "coesa", "apontamentos": []})


@pytest.mark.parametrize("nota", [0, 6, -1])
def test_nota_fora_da_faixa_derruba_a_avaliacao(nota):
    with pytest.raises(ValueError):
        normalizar_avaliacao({"nota": nota})


def test_nota_como_texto_numerico_e_aceita():
    assert normalizar_avaliacao({"nota": "3"}).nota == 3


def test_veredito_desconhecido_cai_no_padrao():
    assert normalizar_avaliacao({"nota": 3, "veredito": "otima"}).veredito == "aceitavel"


def test_apontamento_de_tipo_inventado_e_descartado_sem_derrubar():
    avaliacao = normalizar_avaliacao(
        {
            "nota": 2,
            "apontamentos": [
                {"tipo": "inventado", "descricao": "x"},
                {"tipo": "repeticao", "descricao": "y"},
            ],
        }
    )

    assert [a["tipo"] for a in avaliacao.apontamentos] == ["repeticao"]


def test_apontamentos_em_formato_errado_viram_lista_vazia():
    assert normalizar_avaliacao({"nota": 3, "apontamentos": "nenhum"}).apontamentos == []


def test_payload_que_nao_e_objeto_derruba():
    with pytest.raises(ValueError):
        normalizar_avaliacao(["nota", 3])


def test_rotulo_desconhecido_devolve_o_proprio_slug():
    assert rotulo_do_tipo("repeticao") == "Repetição que sobrou"
    assert rotulo_do_tipo("xpto") == "xpto"

"""D-996: o avaliador do bruto vê o que a live diz DEPOIS do fim, marcado como fora do corte."""

from app.domain.corte.avaliacao_bruto import (
    JANELA_SEGUINTE_SEG,
    montar_texto_avaliado,
    trecho_seguinte,
)

_LIVE = [
    {"start": 90.0, "texto": "dentro do corte"},
    {"start": 103.0, "texto": "continuação da ideia"},
    {"start": 110.0, "texto": "e fecha aqui."},
    {"start": 140.0, "texto": "longe demais"},
]


def test_pega_so_as_falas_da_janela_apos_o_fim_com_tempo_relativo():
    seguinte = trecho_seguinte(_LIVE, 100.0)

    assert seguinte is not None
    assert [(f["start"], f["texto"]) for f in seguinte.falas] == [
        (3.0, "continuação da ideia"),
        (10.0, "e fecha aqui."),
    ]
    assert seguinte.fim_da_live is False


def test_a_janela_e_a_constante_nomeada():
    assert JANELA_SEGUINTE_SEG == 15.0
    # 115s = exatamente fim + janela: ainda entra; 116s não.
    live = [{"start": 115.0, "texto": "no limite"}, {"start": 116.0, "texto": "fora"}]

    assert [f["texto"] for f in trecho_seguinte(live, 100.0).falas] == ["no limite"]


def test_texto_marca_a_secao_como_fora_do_corte():
    texto = montar_texto_avaliado(
        [{"start": 0.0, "texto": "fala do corte"}], [], trecho_seguinte(_LIVE, 100.0)
    )
    linhas = texto.splitlines()

    assert linhas[0] == "[00:00] fala do corte"
    assert "FORA DO CORTE" in linhas[1]
    assert linhas[2] == "[+00:03] continuação da ideia"
    assert linhas[3] == "[+00:10] e fecha aqui."


def test_fim_da_live_diz_que_nao_ha_nada_depois():
    seguinte = trecho_seguinte([{"start": 90.0, "texto": "última fala"}], 100.0)

    assert seguinte.fim_da_live is True
    texto = montar_texto_avaliado([{"start": 0.0, "texto": "x"}], [], seguinte)
    assert "a live termina aqui" in texto.splitlines()[-1]


def test_janela_sem_fala_nao_e_fim_da_live():
    seguinte = trecho_seguinte(_LIVE, 118.0)  # só há fala a 140s: silêncio, não fim

    assert seguinte.falas == []
    assert seguinte.fim_da_live is False
    texto = montar_texto_avaliado([{"start": 0.0, "texto": "x"}], [], seguinte)
    assert "sem fala nesse intervalo" in texto.splitlines()[-1]


def test_sem_transcricao_da_live_nao_afirma_nada_e_o_material_fica_como_era():
    assert trecho_seguinte([], 100.0) is None
    assert montar_texto_avaliado([{"start": 0.0, "texto": "x"}], [], None) == "[00:00] x"

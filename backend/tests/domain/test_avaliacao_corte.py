"""D-419: vocabulário e validação da avaliação de qualidade por corte."""

from __future__ import annotations

import pytest
from app.domain.corte.avaliacao_corte import (
    LIMITE_COMENTARIO,
    MOTIVOS_AVALIACAO,
    SLUGS_MOTIVOS,
    motivos_persistidos,
    normalizar_comentario,
    normalizar_motivos,
    rotulo_do_motivo,
    serializar_motivos,
    validar_voto,
)


@pytest.mark.parametrize("voto", [1, 2, 3, 4, 5])
def test_voto_na_faixa_passa(voto: int):
    assert validar_voto(voto) == voto


@pytest.mark.parametrize("voto", [0, 6, -1, 100])
def test_voto_fora_da_faixa_falha(voto: int):
    with pytest.raises(ValueError):
        validar_voto(voto)


def test_voto_booleano_nao_passa_por_inteiro():
    # bool é subclasse de int em Python: sem a guarda, True viraria nota 1.
    with pytest.raises(ValueError):
        validar_voto(True)


def test_motivos_saem_na_ordem_canonica_sem_repetir():
    informados = ["titulo", "borda_inicio", "titulo", "duracao"]
    assert normalizar_motivos(informados) == ["borda_inicio", "duracao", "titulo"]


def test_motivo_desconhecido_e_descartado_sem_derrubar_o_resto():
    assert normalizar_motivos(["borda_fim", "slug_inventado"]) == ["borda_fim"]


def test_motivos_vazio_ou_none():
    assert normalizar_motivos(None) == []
    assert normalizar_motivos([]) == []


def test_ida_e_volta_pela_coluna_json():
    motivos = ["contexto", "tema_fraco"]
    assert motivos_persistidos(serializar_motivos(motivos)) == motivos


@pytest.mark.parametrize("bruto", [None, "", "{}", "nao é json", '"texto"'])
def test_coluna_corrompida_ou_legada_vira_lista_vazia(bruto):
    assert motivos_persistidos(bruto) == []


def test_comentario_e_aparado_e_truncado():
    assert normalizar_comentario("  sobrou tempo no fim  ") == "sobrou tempo no fim"
    assert len(normalizar_comentario("x" * (LIMITE_COMENTARIO + 500))) == LIMITE_COMENTARIO
    assert normalizar_comentario(None) == ""


def test_todo_motivo_tem_slug_unico_e_rotulo():
    assert len(set(SLUGS_MOTIVOS)) == len(MOTIVOS_AVALIACAO)
    assert all(motivo["rotulo"].strip() for motivo in MOTIVOS_AVALIACAO)


def test_rotulo_do_motivo_cai_no_slug_quando_desconhecido():
    assert rotulo_do_motivo("borda_inicio") == "Começo fora do lugar"
    assert rotulo_do_motivo("slug_inventado") == "slug_inventado"

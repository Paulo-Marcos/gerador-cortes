"""D-1083: decodificar duas vezes dá o mesmo que decodificar uma.

O caminho do VTT decodifica no `parse_vtt` e de novo no funil da transcrição
(`limpar_e_ordenar_transcricao`). Com um `html.unescape` só, a entidade escapada
duas vezes saía de um jeito na ingestão e de outro na sincronia.
"""

from app.domain.projeto.entidades_da_legenda import decodificar_entidades_da_legenda


def test_decodificar_de_novo_nao_muda_entidade_escapada_duas_vezes():
    uma_vez = decodificar_entidades_da_legenda("[&amp;amp;nbsp;__&amp;amp;nbsp;]")

    assert decodificar_entidades_da_legenda(uma_vez) == uma_vez == "[ __ ]"


def test_parser_e_funil_juntos_dao_o_mesmo_texto_que_um_so():
    texto = "P&amp;amp;amp;D"

    assert decodificar_entidades_da_legenda(decodificar_entidades_da_legenda(texto)) == "P&D"
    assert decodificar_entidades_da_legenda(texto) == "P&D"

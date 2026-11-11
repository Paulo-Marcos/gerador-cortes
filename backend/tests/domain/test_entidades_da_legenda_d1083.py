"""D-1083: a decodificação das entidades HTML da legenda do YouTube."""

from app.domain.projeto.entidades_da_legenda import decodificar_entidades_da_legenda


def test_mascara_de_palavrao_vira_espaco_comum():
    assert decodificar_entidades_da_legenda("[&nbsp;__&nbsp;]") == "[ __ ]"


def test_texto_sem_entidade_fica_igual():
    assert decodificar_entidades_da_legenda("veja bem, é isso") == "veja bem, é isso"


def test_decodificar_texto_ja_limpo_nao_muda_nada():
    limpo = decodificar_entidades_da_legenda("não é [&nbsp;__&nbsp;] &gt;&gt; P&amp;D")

    assert decodificar_entidades_da_legenda(limpo) == limpo == "não é [ __ ] >> P&D"

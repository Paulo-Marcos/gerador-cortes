"""O sistema muda status pelo ciclo de vida: fora da tabela avisa, não derruba (D-665)."""

import logging
from types import SimpleNamespace

from app.models import StatusCorte, StatusProjeto
from app.services.ciclo_de_vida import marcar_corte, mudar_projeto


def test_transicao_prevista_nao_faz_barulho(caplog):
    projeto = SimpleNamespace(id="p1", status="pronto")

    with caplog.at_level(logging.WARNING):
        mudar_projeto(projeto, StatusProjeto.ANALISANDO, origem="teste")

    assert projeto.status == StatusProjeto.ANALISANDO
    assert "fora da tabela" not in caplog.text


def test_transicao_fora_da_tabela_aplica_e_avisa_com_a_origem(caplog):
    """Uma ingestão de uma hora não pode morrer porque a tabela não previu o salto."""
    projeto = SimpleNamespace(id="p1", status="analisado")

    with caplog.at_level(logging.WARNING):
        mudar_projeto(projeto, StatusProjeto.BAIXANDO, origem="ingestao")

    assert projeto.status == StatusProjeto.BAIXANDO
    assert "analisado -> baixando fora da tabela (origem: ingestao)" in caplog.text


def test_status_em_memoria_como_enum_e_lido_pelo_valor(caplog):
    """`str()` de um enum misto dá 'StatusProjeto.PRONTO' no Python 3.13."""
    projeto = SimpleNamespace(id="p1", status=StatusProjeto.PRONTO)

    with caplog.at_level(logging.WARNING):
        mudar_projeto(projeto, StatusProjeto.ANALISANDO, origem="teste")

    assert "fora da tabela" not in caplog.text


def test_render_final_marca_processado_sem_aviso(caplog):
    corte = SimpleNamespace(id="c1", status=StatusCorte.APROVADO)

    with caplog.at_level(logging.WARNING):
        marcar_corte(corte, StatusCorte.PROCESSADO, origem="render final")

    assert corte.status == StatusCorte.PROCESSADO
    assert "fora da tabela" not in caplog.text


def test_corte_rejeitado_renderizado_avisa(caplog):
    corte = SimpleNamespace(id="c1", status="rejeitado")

    with caplog.at_level(logging.WARNING):
        marcar_corte(corte, StatusCorte.PROCESSADO, origem="render final")

    assert "rejeitado -> processado fora da tabela" in caplog.text

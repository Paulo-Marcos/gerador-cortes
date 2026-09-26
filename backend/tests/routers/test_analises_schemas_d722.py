"""Os schemas da Área de Análises descrevem o payload inteiro (D-722).

No FastAPI o `response_model` FILTRA a resposta: um campo que o domínio manda e
o schema esquece some da tela sem erro. Aqui o diff produzido pelo domínio passa
pelo schema e tem de voltar idêntico — com snapshot, sem proposta da IA e legado.
(A mesma conferência rodou sobre os 170 projetos de uma cópia da PROD.)
"""

import pytest
from app.domain.corte.telemetria_cortes import diff_proposta_vs_final
from app.routers.analises_schemas import (
    LevantamentoTituloResponse,
    TelemetriaCorteDiff,
    YoutubeStatsSyncResponse,
)

_CORTE = {
    "id": "c-1",
    "numero": 1,
    "titulo_proposto": "Título proposto",
    "titulo_youtube": "Título final",
    "inicio_seg": 100.0,
    "fim_seg": 700.0,
    "status": "aprovado",
    "trechos_geracoes": 2,
    "voto_qualidade": 4,
    "voto_qualidade_motivos": ["ritmo"],
    "desvios": [{"inicio": "00:02:00", "fim": "00:02:30", "origem": "claude"}],
}
_SNAPSHOT = {
    "titulo_proposto": "Título proposto",
    "inicio_seg": 90.0,
    "fim_seg": 710.0,
    "desvios": [{"inicio": "00:05:00", "fim": "00:05:10", "origem": "claude"}],
    "origem_analise": "claude",
}


@pytest.mark.parametrize(
    ("snapshot", "tem_snapshots"),
    [(_SNAPSHOT, True), (None, True), (None, False)],
    ids=["com_snapshot", "sem_proposta_ia", "sem_snapshot"],
)
def test_o_diff_do_dominio_passa_pelo_schema_sem_perder_nada(snapshot, tem_snapshots):
    diff = diff_proposta_vs_final(snapshot, _CORTE, projeto_tem_snapshots=tem_snapshots)

    assert TelemetriaCorteDiff.model_validate(diff).model_dump(mode="json") == diff


def test_o_levantamento_por_titulo_leva_a_duracao_media_que_a_tela_nao_declarava():
    linha = {
        "grupo": "comprimento",
        "faixa": "curto",
        "videos": 3,
        "views_total": 900,
        "views_media": 300.0,
        "retencao_media_pct": 41.5,
        "retencao_ponderada_pct": 40.2,
        "avg_view_duration_media_seg": 210.0,
    }

    volta = LevantamentoTituloResponse.model_validate({"grupos": [linha]}).model_dump()

    assert volta == {"grupos": [linha]}


def test_a_sync_iniciada_e_a_que_pede_reautorizar_cabem_no_mesmo_schema():
    iniciada = YoutubeStatsSyncResponse.model_validate(
        {"status": "iniciado", "mensagem": "em andamento"}
    )
    erro = YoutubeStatsSyncResponse.model_validate(
        {"status": "erro", "precisa_reautorizar": True, "mensagem": "reautorize"}
    )

    assert iniciada.precisa_reautorizar is None
    assert erro.precisa_reautorizar is True

"""As respostas pequenas do corte saem inteiras pelo schema (D-722)."""

import pytest
from app.routers.cortes_schemas import DeteccaoIniciadaResponse, SincroniaPosProducaoResponse
from app.routers.resposta_api import PromptEmPartesResponse
from pydantic import ValidationError


@pytest.mark.parametrize("status", ["iniciado", "em_andamento"])
def test_a_deteccao_responde_os_dois_estados(status):
    resposta = {"status": status, "corte_id": "c1"}

    assert DeteccaoIniciadaResponse.model_validate(resposta).model_dump() == resposta


@pytest.mark.parametrize("status", ["ok", "nada_a_fazer"])
def test_a_sincronia_da_pos_producao_responde_os_dois_estados(status):
    resposta = {"status": status, "mensagem": "…"}

    assert SincroniaPosProducaoResponse.model_validate(resposta).model_dump() == resposta


def test_estado_fora_do_vocabulario_e_recusado():
    with pytest.raises(ValidationError):
        DeteccaoIniciadaResponse.model_validate({"status": "pronto", "corte_id": "c1"})


def test_o_prompt_de_trechos_passa_inteiro():
    prompt = {
        "prompts": [{"parte": 1, "total_partes": 2, "texto": "…"}],
        "formato_esperado": {"trechos": [{"inicio_hms": "HH:MM:SS"}]},
    }

    assert PromptEmPartesResponse.model_validate(prompt).model_dump() == prompt


def _situacao(**progresso):
    return {
        "fases": {
            "raw": True,
            "grade": True,
            "overlays": False,
            "compose": False,
            "render_final": False,
            "encode": False,
        },
        "overlays_count": 0,
        "tem_etapas_concluidas": True,
        "state": "running",
        "progress": 42,
        "stage": "Overlays",
        "running": True,
        "elapsed_seconds": 12.5,
        "error": "",
        **progresso,
    }


@pytest.mark.parametrize(
    "progresso",
    [{}, {"progress": 42.5}, {"state": "cancelled", "running": False}],
    ids=["inteiro", "fracao", "cancelado"],
)
def test_a_situacao_do_pipeline_passa_inteira(progresso):
    from app.routers.cortes_schemas import SituacaoDoPipelineResponse

    situacao = _situacao(**progresso)

    assert SituacaoDoPipelineResponse.model_validate(situacao).model_dump() == situacao


def test_as_cenas_geradas_passam_inteiras_com_os_retratos():
    from app.routers.cortes_schemas import CenasDoCorteResponse

    cenas = {
        "formato": "cortes",
        "cenas": [{"tipo": "ficha_biografica", "startLeg": 2, "nome": "Fulano"}],
        "retratos": {
            "total_fichas": 1,
            "atualizados": 0,
            "ja_tinham": 1,
            "nao_encontrados": 0,
            "sem_nome": 0,
            "erros": 0,
            "nomes_sem_retrato": [],
            "nomes_com_erro": [],
        },
    }

    assert CenasDoCorteResponse.model_validate(cenas).model_dump() == cenas

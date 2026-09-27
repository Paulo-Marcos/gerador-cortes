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

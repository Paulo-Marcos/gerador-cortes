"""As respostas do corte saem inteiras pelo schema (D-722)."""

from datetime import datetime

import pytest
from app.routers.cortes_schemas import (
    CorteResponse,
    DeteccaoIniciadaResponse,
    SincroniaPosProducaoResponse,
)
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


def _corte(**listas):
    return {
        "id": "c1",
        "projeto_id": "p1",
        "numero": 1,
        "titulo_proposto": "",
        "resumo": "",
        "tema_central": "",
        "inicio_hms": "00:00:00",
        "fim_hms": "00:01:00",
        "inicio_seg": 0.0,
        "fim_seg": 60.0,
        "desvios": [],
        "status": "proposto",
        "arquivo_clip_path": "",
        "is_leitura": 0,
        "autor_leitura": "",
        "criado_em": datetime(2026, 9, 26),
        **listas,
    }


def _listas_da_resposta(**listas):
    resposta = CorteResponse.model_validate(_corte(**listas)).model_dump(mode="json")
    return {campo: resposta[campo] for campo in listas}


def test_os_itens_das_listas_saem_como_vieram():
    # Chave que o schema não declara passa; chave que só um item traz não vira
    # null no outro; segundo inteiro continua inteiro.
    listas = {
        "desvios": [
            {
                "inicio_hms": "00:00:01",
                "fim_hms": "00:00:02",
                "motivo": "m",
                "categoria": "silencio",
                "inicio_seg": 1,
                "fim_seg": 2.5,
                "origem": "juncao",
                "nova_chave": {"x": 1},
            },
            {"inicio_hms": "00:00:03", "fim_hms": "00:00:04", "motivo": "m", "categoria": "chat"},
        ],
        "transcricao_corte": [
            {
                "start": 0.5,
                "end": 1.5,
                "texto": "oi",
                "speaker": "SPEAKER_00",
                "palavras": [{"inicio_seg": 0.5, "texto": "oi"}],
            },
            {"start": 1.5, "end": 2.5, "texto": "tudo"},
        ],
        "transcricao_final": [
            {"start": 0.5, "end": 1.5, "texto": "oi", "inicio": 0.0, "fim": 1.0},
        ],
        "segmentos_detectados": [{"inicio": 1.0, "fim": 2.0, "score": 0.9, "status": "sugerido"}],
        "arranjo_blocos": [
            {"inicio_seg": 30.0, "fim_seg": 60.0},
            {"inicio_seg": 0.0, "fim_seg": 30.0},
        ],
        "cenas_remotion": {
            "formato": "v2",
            "cenas": [
                {
                    "tipo": "enfase",
                    "inicio": 1.0,
                    "fim": 6.0,
                    "inicio_seg": 1.0,
                    "fim_seg": 6.0,
                    "numero": "3",
                }
            ],
        },
        "layout_youtube": {"modo_padrao": "compartilhada", "regioes": [], "placa": {"nome": "N"}},
    }

    assert _listas_da_resposta(**listas) == listas


def test_o_roteiro_de_cenas_antigo_e_a_lista_pura():
    cenas = [{"inicio": 1.0, "fim": 6.0, "inicio_seg": 1.0, "fim_seg": 6.0}]

    assert _listas_da_resposta(cenas_remotion=cenas) == {"cenas_remotion": cenas}


def test_corte_sem_layout_responde_objeto_vazio():
    assert _listas_da_resposta(layout_youtube={}) == {"layout_youtube": {}}

"""A limpeza de arquivos nos seus dois ramos, sem mudar a resposta (D-722)."""

import pytest
from app.routers.projetos_schemas import LimpezaDeArquivosResponse
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    "resultado",
    [
        # sem pasta do projeto: o zero é inteiro e não pode virar 0.0
        {"message": "Nenhum arquivo encontrado para remover.", "liberado_mb": 0, "removidos": []},
        # com pasta: o relatório inteiro da retenção
        {
            "liberado_mb": 812.4,
            "retido_mb": 120.0,
            "removidos": ["a.mp4"],
            "preservados": ["bruto.mp4"],
            "pulados": [],
            "erros": [],
            "message": "812.4 MB liberados.",
        },
    ],
    ids=["sem_pasta", "com_pasta"],
)
def test_a_limpeza_passa_sem_chave_inventada_nem_numero_mudado(resultado):
    rotas = FastAPI()

    @rotas.get("/x", response_model=LimpezaDeArquivosResponse, response_model_exclude_unset=True)
    def _rota():
        return resultado

    resposta = TestClient(rotas).get("/x")

    assert resposta.json() == resultado
    assert '"liberado_mb":0,' in resposta.text or resultado["liberado_mb"] != 0


def test_o_prompt_da_analise_passa_inteiro():
    from app.routers.projetos_schemas import PromptAnaliseResponse

    prompt = {
        "prompts": [{"parte": 1, "total_partes": 1, "texto": "Analise..."}],
        "formato_esperado": {"cortes": [{"titulo_proposto": "...", "inicio_seg": 0}]},
    }

    assert PromptAnaliseResponse.model_validate(prompt).model_dump() == prompt


def test_a_analise_via_ia_espalha_o_resultado_do_servico_na_resposta():
    from app.routers.claude_ia import AnaliseViaIaResponse

    resposta = {
        "message": "Análise via IA concluída",
        "projeto_id": "p1",
        "provider": "gemini",
        "total_cortes": 4,
        "pulados_existentes": 1,
        "total_descartados": 2,
    }

    assert AnaliseViaIaResponse.model_validate(resposta).model_dump() == resposta

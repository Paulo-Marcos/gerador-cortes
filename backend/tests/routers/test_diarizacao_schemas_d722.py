"""A resposta da diarização nos seus dois ramos, sem chave inventada (D-722).

`ok=False` traz só o motivo (degradação graciosa: sem token, sem vídeo...);
`ok=True`, os falantes e o canal. O schema declara os dois; a rota omite o que
o serviço não mandou.
"""

from app.routers.diarizacao import DiarizacaoResponse, FalantesResponse
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _responder(corpo: dict) -> dict:
    rotas = FastAPI()

    @rotas.get("/x", response_model=DiarizacaoResponse, response_model_exclude_unset=True)
    def _rota():
        return corpo

    return TestClient(rotas).get("/x").json()


def test_a_degradacao_graciosa_traz_so_o_motivo():
    corpo = {"ok": False, "motivo": "Projeto sem vídeo baixado para diarizar."}

    assert _responder(corpo) == corpo


def test_o_sucesso_traz_os_falantes_e_o_canal_mesmo_nulo():
    corpo = {
        "ok": True,
        "falantes": {"SPEAKER_00": {"nome": "", "is_canal": True}},
        "canal": None,
    }

    assert _responder(corpo) == corpo


def test_o_mapa_de_falantes_passa_inteiro():
    mapa = {"falantes": {"SPEAKER_00": {"nome": "Pedro", "is_canal": True}}}

    assert FalantesResponse.model_validate(mapa).model_dump() == mapa

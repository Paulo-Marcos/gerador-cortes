"""O metadado do corte sai pelo schema nos seus dois formatos, sem chave
inventada (D-722)."""

import pytest
from app.routers.metadados_schemas import MetadadoDoCorteResponse
from fastapi import FastAPI
from fastapi.testclient import TestClient

_SEM_METADADO = {
    "id": None,
    "corte_id": "c1",
    "is_fire": False,
    "titulo_youtube": "",
    "descricao_youtube": "",
    "tags_youtube": [],
    "opcoes_titulo": [],
    "opcoes_texto_capa": [],
    "texto_capa": "",
    "prompt_thumbnail": "",
    "thumbnail_path": "",
}
_COM_METADADO = {
    **_SEM_METADADO,
    "id": "m1",
    "is_fire": True,
    "candidato_shorts": False,
    "titulo_youtube": "🔥 Título",
    "tags_youtube": ["#live"],
    "link_live_com_timestamp": "https://youtu.be/x?t=10",
    "canal_credito": "Canal",
    "thumbnail_tiktok_path": "",
    "etiqueta_tiktok": "",
    "prompt_capa_tiktok": "",
    "numero_serie": 1,
    "cor_serie": "",
    "criado_em": "2026-09-01T12:00:00",
    "atualizado_em": "2026-09-02T12:00:00",
}


@pytest.mark.parametrize("metadado", [_SEM_METADADO, _COM_METADADO], ids=["sem", "com"])
def test_o_metadado_passa_inteiro_nos_dois_formatos(metadado):
    rotas = FastAPI()

    @rotas.get("/x", response_model=MetadadoDoCorteResponse, response_model_exclude_unset=True)
    def _rota():
        return metadado

    assert TestClient(rotas).get("/x").json() == metadado

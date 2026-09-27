"""As respostas da fábrica de shorts saem inteiras pelo schema (D-722).

A leitura (fires, shorts, palco, post, capa) foi conferida contra uma cópia da
PROD; aqui ficam as respostas de ação, que não têm dado gravado para conferir.
"""

import pytest
from app.routers import shorts_schemas as esquemas
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _pela_rota(modelo, corpo, *, exclude_unset=False):
    rotas = FastAPI()

    @rotas.post("/x", response_model=modelo, response_model_exclude_unset=exclude_unset)
    def _rota():
        return corpo

    return TestClient(rotas).post("/x").json()


@pytest.mark.parametrize(
    "resultado",
    [
        # API do YouTube
        {
            "plataforma": "youtube",
            "video_id": "abc",
            "url": "https://youtu.be/abc",
            "capa_aplicada": True,
            "avisos": [],
        },
        # pacote manual
        {
            "plataforma": "instagram",
            "modo": "manual",
            "pasta": "C:/x/pacote",
            "video": "C:/x/video.mp4",
            "capa": "",
            "avisos": ["sem capa"],
            "titulo": "T",
            "descricao": "D",
            "hashtags": ["#a"],
        },
        # robô assistido: o pacote, o relatório dele e o que a rota soma
        {
            "plataforma": "tiktok",
            "modo": "assistido",
            "pasta": "C:/x",
            "avisos": [],
            "passo": "legenda",
            "legenda": "T\n\nD",
            "vigiando": False,
            "publicado": True,
        },
        # preparo para subir à mão: sem plataforma nem avisos no topo
        {"pasta": "C:/x", "pasta_aberta": True, "erro_ao_abrir": "", "url_upload": "https://t"},
    ],
    ids=["youtube", "manual", "assistido", "staging"],
)
def test_o_resultado_da_publicacao_passa_como_veio(resultado):
    assert _pela_rota(esquemas.ResultadoDaPublicacao, resultado, exclude_unset=True) == resultado


def test_o_lote_passa_inteiro():
    item = {
        "alvo_tipo": "short",
        "alvo_id": "s1",
        "plataforma": "tiktok",
        "plataforma_rotulo": "TikTok",
        "rotulo": "Short 1",
        "estado": "sua_vez",
        "detalhe": "",
        "url": "",
    }
    lote = {
        "lote_id": "l1",
        "criado_em": "2026-09-27T10:00:00",
        "cancelado": False,
        "terminou": False,
        "tiktok_assistido": True,
        "instagram_assistido": False,
        "publicar_sozinho": False,
        "raias": [
            {
                "plataforma": "tiktok",
                "rotulo": "TikTok",
                "exige_humano": True,
                "aviso": "",
                "itens": [item],
            }
        ],
    }

    assert _pela_rota(esquemas.LoteCanceladoResponse, {"cancelado": True, "lote": lote}) == {
        "cancelado": True,
        "lote": lote,
    }
    assert _pela_rota(esquemas.LoteAtualResponse, {"lote": None}) == {"lote": None}


@pytest.mark.parametrize(
    "progresso",
    [
        None,
        {
            "estagio": "final",
            "concluido": False,
            "erro": None,
            "decorrido_seg": 12.5,
            "passos": [{"chave": "cortar", "label": "Cortar", "status": "rodando"}],
        },
    ],
    ids=["sem_render", "rodando"],
)
def test_o_progresso_do_render_passa_inteiro(progresso):
    assert _pela_rota(esquemas.ProgressoResponse, {"render": progresso}) == {"render": progresso}

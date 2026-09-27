"""Os schemas da exportação descrevem a resposta inteira (D-722).

O `response_model` FILTRA; aqui o que as rotas montam passa pelo schema e volta
idêntico. A versão de filtro tem dois formatos: com o `meta.json` gravado pelo
processamento (que acrescenta `preview`) e sem ele.
"""

import pytest
from app.routers import export as export_router
from app.routers.export_schemas import FiltrosResponse, VersoesResponse
from fastapi import FastAPI
from fastapi.testclient import TestClient

_SEM_META = {
    "filtro": "cinematic_iii",
    "nome": "cinematic_iii",
    "descricao": "",
    "e_preview": True,
    "completo_disponivel": False,
    "tamanho_mb": 1.4,
}
_COM_META = {**_SEM_META, "nome": "Cinematic III", "descricao": "leve", "preview": True}


@pytest.mark.asyncio
async def test_os_filtros_do_catalogo_passam_inteiros():
    resposta = await export_router.listar_filtros()

    assert FiltrosResponse.model_validate(resposta).model_dump() == resposta


@pytest.mark.parametrize("versao", [_SEM_META, _COM_META], ids=["sem_meta", "com_meta"])
def test_a_versao_passa_inteira_com_e_sem_o_meta_json(versao):
    corpo = {"corte_id": "c1", "versoes": [versao]}
    rotas = FastAPI()

    @rotas.get("/x", response_model=VersoesResponse, response_model_exclude_unset=True)
    def _rota():
        return corpo

    assert TestClient(rotas).get("/x").json() == corpo


_RETENCAO = {
    "liberado_mb": 120.5,
    "retido_mb": 0.0,
    "removidos": ["preview.mp4"],
    "preservados": [],
    "pulados": [],
    "erros": [],
}


@pytest.mark.parametrize(
    "resultado",
    [
        # upload novo, com a limpeza de mídia que roda depois
        {
            "status": "ok",
            "video_id": "abc",
            "url": "https://youtu.be/abc",
            "scheduled_at": None,
            "retencao_arquivos": _RETENCAO,
        },
        # o corte já estava publicado: nada sobe, a mensagem explica
        {
            "status": "ok",
            "video_id": "abc",
            "url": "https://youtu.be/abc",
            "scheduled_at": "",
            "mensagem": "Corte já publicado; upload ignorado.",
            "retencao_arquivos": _RETENCAO,
        },
    ],
    ids=["upload_novo", "ja_publicado"],
)
def test_os_dois_ramos_do_upload_passam_sem_chave_inventada(resultado):
    from app.routers.export_schemas import YouTubeUploadResponse

    rotas = FastAPI()

    @rotas.get("/x", response_model=YouTubeUploadResponse, response_model_exclude_unset=True)
    def _rota():
        return resultado

    assert TestClient(rotas).get("/x").json() == resultado


def test_a_liberacao_passa_inteira():
    from app.routers.export_schemas import LiberarPublicacaoResponse

    resultado = {
        "status": "ok",
        "corte_id": "c1",
        "destino": "youtube",
        "rotulo": "YouTube",
        "liberado": True,
        "campos_limpos": ["youtube_video_id", "youtube_url_publicado"],
        "video_pronto": True,
        "mensagem": "Liberado.",
    }

    assert LiberarPublicacaoResponse.model_validate(resultado).model_dump() == resultado


@pytest.mark.parametrize(
    "resultado",
    [
        {"job_id": "bruto:c1", "cancelado": True, "jobs_worker_avisados": 1},
        {
            "job_id": "pos:c1",
            "cancelado": True,
            "jobs_worker_avisados": 0,
            "processos_encerrados": 2,
        },
    ],
    ids=["job_em_voo", "item_da_pos"],
)
def test_o_cancelamento_passa_nos_dois_ramos_sem_chave_inventada(resultado):
    from app.routers.export_schemas import JobCanceladoResponse

    rotas = FastAPI()

    @rotas.post("/x", response_model=JobCanceladoResponse, response_model_exclude_unset=True)
    def _rota():
        return resultado

    assert TestClient(rotas).post("/x").json() == resultado


def test_a_fila_global_passa_inteira_com_job_de_projeto_e_de_corte():
    from app.routers.export_schemas import FilaGlobalResponse

    job = {
        "id": "render:c1",
        "tipo": "render",
        "familia": "midia",
        "rotulo_tipo": "render",
        "corte_id": "c1",
        "projeto_id": "p1",
        "corte_numero": 3,
        "projeto_titulo": "Live",
        "estado": "rodando",
        "progresso": 42.5,
        "etapa": "Overlays",
        "erro": "",
    }
    fila = {
        "pos_producao": {
            "total": 1,
            "processando": 1,
            "aguardando": 0,
            "concluidos": 0,
            "erros": 0,
            "ativo": True,
        },
        "upload_youtube": {
            "total": 0,
            "processando": 0,
            "concluidos": 0,
            "erros": 0,
            "ativo": False,
        },
        "jobs": [
            job,
            {**job, "id": "ingestao:p1", "tipo": "ingestao", "corte_id": "", "corte_numero": None},
        ],
    }

    assert FilaGlobalResponse.model_validate(fila).model_dump() == fila

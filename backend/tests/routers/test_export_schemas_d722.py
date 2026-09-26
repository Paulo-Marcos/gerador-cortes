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

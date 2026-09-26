"""A base das respostas do contrato marca como obrigatório o campo com padrão (D-722).

Na resposta, o campo com padrão sempre vem; o schema precisa dizer isso, senão o
cliente gerado do frontend o tipa como opcional e cada tela trata um `undefined`
que nunca chega.
"""

from app.main import app
from app.routers.resposta_api import RespostaApi


class _Exemplo(RespostaApi):
    obrigatorio: str
    com_padrao: int = 3
    anulavel: str | None = None


def test_no_schema_de_saida_todo_campo_e_obrigatorio():
    schema = _Exemplo.model_json_schema(mode="serialization")

    assert set(schema["required"]) == {"obrigatorio", "com_padrao", "anulavel"}


def test_em_tempo_de_execucao_nada_muda():
    assert _Exemplo(obrigatorio="x").model_dump() == {
        "obrigatorio": "x",
        "com_padrao": 3,
        "anulavel": None,
    }


def test_as_respostas_da_telemetria_saem_com_todos_os_campos_obrigatorios():
    schemas = app.openapi()["components"]["schemas"]

    for nome in ("LlmCallResponse", "UltimaGeracaoResponse"):
        assert set(schemas[nome]["required"]) == set(schemas[nome]["properties"]), nome

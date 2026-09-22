"""O contrato HTTP fica versionado em `backend/openapi.json` (D-664).

O frontend espelha os tipos à mão; uma rota que muda sem querer só era notada
quando algo quebrava na tela. Agora a especificação gerada pelo FastAPI é
comparada com a versionada: mudar a API passa a aparecer no diff do commit, e
mudar sem atualizar o arquivo falha aqui — com a lista do que mudou.

Atualizar o arquivo (mudança intencional):

    ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py
"""

import json
import os
from pathlib import Path

CONTRATO = Path(__file__).resolve().parents[1] / "openapi.json"
LIMITE_DA_LISTA = 20


def _gerar() -> dict:
    from app.main import app

    return app.openapi()


def _serializar(especificacao: dict) -> str:
    # Chaves ordenadas e formato fixo: o diff do commit mostra só o que mudou.
    return json.dumps(especificacao, sort_keys=True, ensure_ascii=False, indent=2) + "\n"


def _operacoes(especificacao: dict) -> dict[str, str]:
    return {
        f"{metodo.upper()} {caminho}": json.dumps(operacao, sort_keys=True)
        for caminho, metodos in especificacao.get("paths", {}).items()
        for metodo, operacao in metodos.items()
    }


def _schemas(especificacao: dict) -> dict[str, str]:
    return {
        nome: json.dumps(schema, sort_keys=True)
        for nome, schema in especificacao.get("components", {}).get("schemas", {}).items()
    }


def _o_que_mudou(antes: dict, depois: dict) -> list[str]:
    linhas = []
    for rotulo, extrair in (("rota", _operacoes), ("schema", _schemas)):
        a, d = extrair(antes), extrair(depois)
        linhas += [f"+ {rotulo} nova: {k}" for k in sorted(d.keys() - a.keys())]
        linhas += [f"- {rotulo} removida: {k}" for k in sorted(a.keys() - d.keys())]
        linhas += [f"~ {rotulo} alterada: {k}" for k in sorted(a.keys() & d.keys()) if a[k] != d[k]]
    return linhas or ["~ fora de rotas/schemas (info, tags, servidores)"]


def test_contrato_http_bate_com_o_versionado():
    gerado = _gerar()
    texto = _serializar(gerado)

    if os.environ.get("ATUALIZAR_OPENAPI") == "1":
        CONTRATO.write_text(texto, encoding="utf-8", newline="\n")
        return

    assert CONTRATO.exists(), (
        "backend/openapi.json não existe. Gere com: "
        "ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py"
    )
    # O git pode entregar o arquivo com CRLF no Windows; o contrato é o mesmo.
    versionado = CONTRATO.read_text(encoding="utf-8").replace("\r\n", "\n")
    if versionado == texto:
        return

    mudancas = _o_que_mudou(json.loads(versionado), gerado)
    resumo = "\n".join(mudancas[:LIMITE_DA_LISTA])
    if len(mudancas) > LIMITE_DA_LISTA:
        resumo += f"\n… e mais {len(mudancas) - LIMITE_DA_LISTA}"
    raise AssertionError(
        "O contrato HTTP mudou e backend/openapi.json não acompanhou:\n"
        f"{resumo}\n\n"
        "Se a mudança é intencional: "
        "ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py"
    )


def test_o_resumo_aponta_a_rota_que_mudou():
    """O valor do teste está na mensagem: dizer ONDE, não só que mudou."""
    antes = {"paths": {"/a": {"get": {"x": 1}}, "/b": {"post": {}}}}
    depois = {"paths": {"/a": {"get": {"x": 2}}, "/c": {"get": {}}}}

    assert _o_que_mudou(antes, depois) == [
        "+ rota nova: GET /c",
        "- rota removida: POST /b",
        "~ rota alterada: GET /a",
    ]

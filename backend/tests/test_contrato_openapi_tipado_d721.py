"""A catraca das respostas sem tipo no contrato HTTP (D-721).

O frontend passa a consumir um cliente GERADO do `openapi.json`. Uma rota sem
`response_model` aparece lá como `{}` — o cliente não tem o que tipar, e a tela
volta a escrever o tipo à mão, que é justamente a cópia que a D-721 elimina.

Eram 174 de 232 operações. Tipar todas de uma vez seria perigoso: no FastAPI o
`response_model` FILTRA a resposta, e um campo esquecido some da tela sem erro.
Então elas ganham tipo junto com o cliente que as consome (E-057), e esta conta
só anda para baixo: tipou uma rota, baixe o teto no mesmo commit; criou uma rota
nova, ela já nasce tipada.
"""

import json
from pathlib import Path

ESPEC = Path(__file__).resolve().parents[1] / "openapi.json"

# Operações cuja resposta 2xx em JSON não tem schema. Só desce.
TETO = 161


def _sem_tipo() -> list[str]:
    spec = json.loads(ESPEC.read_text(encoding="utf-8"))
    faltando = []
    for caminho, operacoes in spec["paths"].items():
        for metodo, operacao in operacoes.items():
            ok = next(
                (r for codigo, r in operacao.get("responses", {}).items() if codigo[0] == "2"),
                None,
            )
            if ok is None or "content" not in ok:
                continue
            schema = ok["content"].get("application/json", {}).get("schema")
            if not schema:
                faltando.append(f"{metodo.upper()} {caminho}")
    return faltando


def test_respostas_sem_tipo_so_diminuem():
    faltando = _sem_tipo()

    assert len(faltando) <= TETO, (
        f"{len(faltando) - TETO} rota(s) nova(s) sem response_model — declare o tipo da "
        "resposta; o cliente gerado do frontend depende dele."
    )
    assert len(faltando) == TETO, (
        f"Agora são {len(faltando)} sem tipo: baixe TETO para {len(faltando)} neste commit."
    )

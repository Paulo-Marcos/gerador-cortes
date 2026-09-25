"""Catraca da transação nos routers (D-702, ADR-0016).

O caso de uso é a unidade de trabalho: quem abre a sessão e faz commit é o
service. Router que recebe a sessão do `get_db`, faz `commit()` ou abre
`AsyncSessionLocal()` é o jeito antigo, que o E-053 vai desfazendo router a
router. Os números abaixo são a dívida medida, com a demanda que a quita.

A catraca só gira para um lado: número que sobe reprova — endpoint novo nasce
sem sessão; número que desce também reprova, pedindo que a lista seja apertada
no mesmo commit, para cada passo ficar registrado no diff.
"""

import ast
from pathlib import Path

# Medido em 25/09/2026; o E-053 (D-703 a D-707) leva a zero.
_DIVIDA = {"Depends(get_db)": 83, "commit()": 9, "AsyncSessionLocal()": 3}

_ROUTERS = Path(__file__).resolve().parents[1] / "app" / "routers"


def _contar(codigo: str) -> dict[str, int]:
    contagem = dict.fromkeys(_DIVIDA, 0)
    for no in ast.walk(ast.parse(codigo)):
        if not isinstance(no, ast.Call):
            continue
        funcao = no.func
        if isinstance(funcao, ast.Name) and funcao.id == "Depends":
            if any(isinstance(a, ast.Name) and a.id == "get_db" for a in no.args):
                contagem["Depends(get_db)"] += 1
        elif isinstance(funcao, ast.Name) and funcao.id == "AsyncSessionLocal":
            contagem["AsyncSessionLocal()"] += 1
        elif isinstance(funcao, ast.Attribute) and funcao.attr == "commit":
            contagem["commit()"] += 1
    return contagem


def _contar_nos_routers() -> dict[str, int]:
    total = dict.fromkeys(_DIVIDA, 0)
    for arquivo in _ROUTERS.rglob("*.py"):
        for padrao, n in _contar(arquivo.read_text(encoding="utf-8")).items():
            total[padrao] += n
    return total


def test_a_transacao_nos_routers_so_diminui():
    atual = _contar_nos_routers()

    assert atual == _DIVIDA, (
        f"Transação nos routers mudou: hoje {atual}, a lista diz {_DIVIDA}. "
        "Se subiu, o endpoint novo abriu sessão ou fez commit: leve isso para o "
        "service (ADR-0016). Se desceu, aperte _DIVIDA neste commit."
    )


def test_a_catraca_enxerga_os_tres_padroes():
    """Um contador que nunca acha nada não guarda nada."""
    sonda = (
        "async def rota(db=Depends(get_db)):\n"
        "    await db.commit()\n"
        "    async with AsyncSessionLocal() as outra:\n"
        "        await outra.commit()\n"
    )

    assert _contar(sonda) == {"Depends(get_db)": 1, "commit()": 2, "AsyncSessionLocal()": 1}

"""A herança do gancho do short, a mesma no backend e na tela (D-712).

RN-12/13: a aparência do gancho herda do preset do corte e o texto nunca. A regra
está escrita duas vezes — aqui (`aparencia_resolvida` + os `normalizar_*`) e na
tela (`lugarEfetivo`, `tamanhoEfetivo`, `duracaoEfetiva`, `realceValido`, em
`ganchoDoShort.ts`) —, porque a prévia do short precisa valer como prova do que
o render vai desenhar.

Mesma defesa da cascata do layout: uma tabela única, gerada aqui, que o vitest
`herancaGanchoAcordo.test.ts` lê e confere. Mudança intencional:
`ATUALIZAR_HERANCA_GANCHO=1 pytest` regera a tabela.
"""

import json
import os
from pathlib import Path

from app.domain.short import gancho_short

TABELA = Path(__file__).resolve().parents[1] / "fixtures" / "heranca_gancho_d712.json"

LUGARES = [
    None,
    {},
    {"x": 0, "y": 0, "largura": 0},
    {"x": 30.0},
    {"y": 72.5, "largura": 55.0},
    {"x": -5, "y": 150, "largura": 1},
    {"x": 12.345, "y": 33.335, "largura": 66.665},
    {"x": 99.999, "y": 0.001, "largura": 100.0},
]
NUMEROS = [None, 0, -1, 0.5, 1.0, 1.25, 2.345, 3.0, 9.999, 100]
REALCES = [None, "", "caixa", "sombra", "veu", "nao-existe", "CAIXA"]


def _lugar(proprio, padrao) -> dict:
    aparencia = gancho_short.aparencia_resolvida(proprio or {}, padrao)
    return {
        "x": gancho_short.normalizar_x(aparencia["x"]),
        "y": gancho_short.normalizar_y(aparencia["y"]),
        "largura": gancho_short.normalizar_largura(aparencia["largura"]),
    }


def _tabela() -> dict:
    return {
        "descricao": (
            "D-712: a heranca do gancho do short (RN-12/13), a mesma no backend e na "
            "tela. Gerada por backend/tests/domain/test_heranca_gancho_d712.py "
            "(ATUALIZAR_HERANCA_GANCHO=1); lida pelo vitest herancaGanchoAcordo.test.ts."
        ),
        "lugar": [
            {"proprio": proprio, "padrao": padrao, "efetivo": _lugar(proprio, padrao)}
            for proprio in LUGARES
            for padrao in LUGARES
        ],
        "tamanho": [{"entrada": n, "efetivo": gancho_short.normalizar_tamanho(n)} for n in NUMEROS],
        "duracao": [{"entrada": n, "efetivo": gancho_short.normalizar_duracao(n)} for n in NUMEROS],
        "realce": [{"entrada": r, "efetivo": gancho_short.normalizar_realce(r)} for r in REALCES],
    }


def test_o_backend_produz_a_tabela_da_heranca_do_gancho():
    esperado = _tabela()
    if os.environ.get("ATUALIZAR_HERANCA_GANCHO") == "1":
        TABELA.write_text(
            json.dumps(esperado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )

    assert json.loads(TABELA.read_text(encoding="utf-8")) == esperado, (
        "a regra do gancho mudou: regere com ATUALIZAR_HERANCA_GANCHO=1"
    )

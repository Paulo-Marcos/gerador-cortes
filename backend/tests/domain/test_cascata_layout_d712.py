"""A cascata do layout horizontal, a mesma no backend e na tela (D-712).

RN-10: global → projeto → corte, e a chave ausente é o mecanismo de herança. A
cascata está escrita duas vezes — aqui (`resolver_layout_em_cascata`) e no
frontend (`resolveLayoutChain`) —, porque o preview resolve a cada edição local
e o render resolve no servidor. Duas cópias da mesma regra sempre divergem (a
lição da D-558), e divergiam: esta tabela achou 11 casos em 65.

A defesa é uma tabela única: cada caso com a entrada nos três níveis e o layout
efetivo. Este teste confere que o backend produz a tabela; o
`cascataLayoutAcordo.test.ts` do frontend lê o MESMO arquivo e confere a tela.
Mudança intencional na cascata: `ATUALIZAR_CASCATA=1 pytest` regera a tabela, e
o vitest diz se a tela acompanhou.
"""

import json
import os
from pathlib import Path

from app.domain.corte.youtube_layout import resolver_layout_em_cascata

TABELA = Path(__file__).resolve().parents[1] / "fixtures" / "cascata_layout_d712.json"

SENTINELA = {"modo_padrao": "full", "regioes": []}
RECORTE = {"x": 10, "y": 20, "w": 300, "h": 200}
POOL = {
    "ausente": None,
    "texto-vazio": "",
    "json-quebrado": "{quebrado",
    "vazio": {},
    "sentinela": SENTINELA,
    "so-modo-compartilhada": {"modo_padrao": "compartilhada"},
    "so-fundo": {"fundo": "cosmograph"},
    "fundo-invalido": {"fundo": "nao-existe"},
    "placa": {"placa": {"nome": "Fulano", "papel": "Convidado"}},
    "compartilhada-uma-tela": {"compartilhada": {"telas": 1}},
    "compartilhada-recorte": {"compartilhada": {"crop_facecam": RECORTE}},
    "compartilhada-slot": {
        "compartilhada": {"slot_tela": {"x": 400, "y": 100, "w": 1200, "h": 700}}
    },
    "full": {"full": {"crop": {"x": 100, "y": 50, "w": 1600, "h": 900}}},
    "regioes": {
        "regioes": [
            {"inicio": 30, "fim": 60, "modo": "full"},
            {"inicio": 0, "fim": 10, "modo": "compartilhada"},
        ]
    },
    "regiao-invalida": {"regioes": [{"inicio": 5, "fim": 2}, "lixo"]},
    "regiao-com-override": {
        "regioes": [{"inicio": 0, "fim": 5, "compartilhada": {"telas": 1, "crop_tela": RECORTE}}]
    },
    "segmento-compartilhada": {"compartilhada_segmento": {"telas": 1}},
    "segmento-full": {"full_segmento": {"crop": {"x": 0, "y": 0, "w": 960, "h": 540}}},
    "completo-em-texto": json.dumps(
        {
            "modo_padrao": "compartilhada",
            "fundo": "cosmograph",
            "regioes": [{"inicio": 1, "fim": 2}],
        }
    ),
}


def _casos() -> list[dict]:
    casos: list[dict] = []

    def caso(nome, corte=None, projeto=None, global_=None):
        casos.append(
            {
                "nome": nome,
                "corte": corte,
                "projeto": projeto,
                "global": global_,
                "efetivo": resolver_layout_em_cascata(corte, projeto, global_),
            }
        )

    # Cada entrada em cada nível, com os outros dois ausentes.
    for nome, valor in POOL.items():
        caso(f"corte:{nome}", corte=valor)
        caso(f"projeto:{nome}", projeto=valor)
        caso(f"global:{nome}", global_=valor)

    # A herança de verdade: o corte intocado herda; o configurado manda.
    caso("corte intocado herda o modo do projeto", SENTINELA, {"modo_padrao": "compartilhada"})
    caso("corte intocado herda o modo do global", SENTINELA, None, {"modo_padrao": "compartilhada"})
    caso("projeto vence o global", None, {"fundo": "cosmograph"}, {"fundo": "hud-forte"})
    caso(
        "corte com regiao sem modo herda o modo", POOL["regioes"], {"modo_padrao": "compartilhada"}
    )
    caso(
        "corte escolhe full explicito sem nada mais",
        {"modo_padrao": "full"},
        {"modo_padrao": "compartilhada"},
    )
    caso(
        "recorte do corte sobre recorte do projeto",
        POOL["compartilhada-recorte"],
        {"compartilhada": {"telas": 1, "crop_tela": RECORTE}},
        {"fundo": "cosmograph"},
    )
    caso(
        "os tres em texto",
        json.dumps(SENTINELA),
        json.dumps({"modo_padrao": "compartilhada"}),
        json.dumps({"fundo": "cosmograph"}),
    )
    caso("projeto quebrado cai no global", None, "{quebrado", {"fundo": "cosmograph"})
    return casos


def test_o_backend_produz_a_tabela_da_cascata():
    esperado = {
        "descricao": (
            "D-712: a cascata do layout horizontal (RN-10), a mesma no backend e na "
            "tela. Gerada por backend/tests/domain/test_cascata_layout_d712.py "
            "(ATUALIZAR_CASCATA=1); lida pelo vitest cascataLayoutAcordo.test.ts."
        ),
        "casos": _casos(),
    }
    if os.environ.get("ATUALIZAR_CASCATA") == "1":
        TABELA.write_text(
            json.dumps(esperado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
    gravada = json.loads(TABELA.read_text(encoding="utf-8"))

    assert len(gravada["casos"]) == len(esperado["casos"]), "a tabela tem outro número de casos"
    divergentes = [
        c["nome"] for c, g in zip(esperado["casos"], gravada["casos"], strict=True) if c != g
    ]
    assert divergentes == [], f"regere com ATUALIZAR_CASCATA=1: {divergentes}"

"""Catraca dos ciclos de import (D-695).

Um ciclo de import é um grupo de módulos em que cada um alcança os outros pelas
importações — inclusive as feitas dentro de função, que o Python aceita e o
ciclo esconde. A lista abaixo é a dívida conhecida, com a demanda que a quita.

A catraca só gira para um lado: um ciclo novo, ou um módulo novo num ciclo
antigo, reprova; um ciclo que encolheu também reprova, pedindo que a lista seja
apertada no mesmo commit que o encolheu. Assim a dívida só diminui, e cada
diminuição fica registrada no diff.
"""

import pytest

grimp = pytest.importorskip("grimp")

_CICLOS_CONHECIDOS = {
    # D-755: o laço interno do export com a fila de tarefas, e a fábrica de
    # shorts, que pede o bruto ao export enquanto o export pede os shorts a ela.
    frozenset(
        {
            "app.services.cancelamento_jobs",
            "app.services.export",
            "app.services.export_bulk_queue",
            "app.services.export_processamento",
            "app.services.shorts",
            "app.services.tasks",
        }
    ),
    # D-697: a migração do boot passa a chamar as duas; exige o main.py (travado).
    frozenset({"app.editorial_scaffolds", "app.editorial_skills"}),
    # D-696: render; os dois arquivos estão travados.
    frozenset({"app.services.pipeline_render", "app.services.remotion_render"}),
}


def _ciclos(pacote: str) -> set[frozenset[str]]:
    """Os grupos de módulos que se alcançam mutuamente (Kosaraju, sem recursão)."""
    grafo = grimp.build_graph(pacote, cache_dir=None)
    modulos = sorted(grafo.modules)
    saidas = {m: sorted(grafo.find_modules_directly_imported_by(m)) for m in modulos}

    ordem: list[str] = []
    visitados: set[str] = set()
    for inicio in modulos:
        if inicio in visitados:
            continue
        visitados.add(inicio)
        pilha = [(inicio, iter(saidas[inicio]))]
        while pilha:
            modulo, vizinhos = pilha[-1]
            proximo = next((v for v in vizinhos if v not in visitados), None)
            if proximo is None:
                pilha.pop()
                ordem.append(modulo)
            else:
                visitados.add(proximo)
                pilha.append((proximo, iter(saidas[proximo])))

    entradas: dict[str, set[str]] = {m: set() for m in modulos}
    for modulo, destinos in saidas.items():
        for destino in destinos:
            entradas[destino].add(modulo)

    ciclos: set[frozenset[str]] = set()
    atribuidos: set[str] = set()
    for raiz in reversed(ordem):
        if raiz in atribuidos:
            continue
        atribuidos.add(raiz)
        grupo, pilha_grupo = set(), [raiz]
        while pilha_grupo:
            modulo = pilha_grupo.pop()
            grupo.add(modulo)
            for origem in entradas[modulo] - atribuidos:
                atribuidos.add(origem)
                pilha_grupo.append(origem)
        if len(grupo) > 1:
            ciclos.add(frozenset(grupo))
    return ciclos


def _descrever(ciclos: set[frozenset[str]]) -> str:
    return "\n".join(f"  {sorted(c)}" for c in sorted(ciclos, key=sorted)) or "  (nenhum)"


def test_os_ciclos_de_import_so_diminuem():
    atuais = _ciclos("app")

    novos = atuais - _CICLOS_CONHECIDOS
    sumidos = _CICLOS_CONHECIDOS - atuais
    assert not novos and not sumidos, (
        "Os ciclos de import mudaram.\n"
        f"Existem hoje e não estão na lista:\n{_descrever(novos)}\n"
        f"Estão na lista e não existem mais:\n{_descrever(sumidos)}\n"
        "Se um ciclo encolheu ou sumiu, aperte _CICLOS_CONHECIDOS neste commit. "
        "Se cresceu ou nasceu, o import novo fechou um ciclo: desfaça-o."
    )


def test_a_catraca_enxerga_um_ciclo_escondido_em_import_tardio(tmp_path, monkeypatch):
    """Um detector que nunca acha nada não guarda nada: a sonda tem um ciclo real."""
    pacote = tmp_path / "sonda_ciclo"
    pacote.mkdir()
    (pacote / "__init__.py").write_text("", encoding="utf-8")
    (pacote / "a.py").write_text("from sonda_ciclo import b\n", encoding="utf-8")
    (pacote / "b.py").write_text("def tardio():\n    from sonda_ciclo import a\n", encoding="utf-8")
    (pacote / "c.py").write_text("from sonda_ciclo import a\n", encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path))

    assert _ciclos("sonda_ciclo") == {frozenset({"sonda_ciclo.a", "sonda_ciclo.b"})}

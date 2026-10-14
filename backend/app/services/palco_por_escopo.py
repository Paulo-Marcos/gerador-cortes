"""O palco de um projeto ou de um corte, por tipo de vídeo (D-923).

O palco global é o do canal (tela de Canais). No modal de posição do pós (o
horizontal) e no do short, o operador ajusta o palco só do corte ou do projeto;
a regra da cascata mora em `domain/canal/palco_do_escopo.py`.

Guarda: a mesma tabela dos componentes do canal (`palco_componentes_store`),
numa linha por escopo (`escopo:projeto:<id>`, `escopo:corte:<id>`), com uma
escolha por tipo (`{"horizontal": {...}, "short": {...}}`). O banco já é por
canal, então a chave não precisa dizer o canal.

Render: `fixar_para_render` põe as escolhas do corte no contexto do render em
curso (`channel_paths.PALCO_DO_CORTE_NO_RENDER`). Daí em diante quem lê os
componentes (`palco_componentes.ler`) vê o palco do corte, e o cache do PNG do
palco vai para a pasta daquela escolha.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core import channel_paths
from app.domain.canal import palco_do_escopo
from app.domain.canal.palco_componentes import PalcoComponentes, mesclar
from app.infrastructure import palco_componentes_store
from app.services import palco_componentes


def _chave(escopo: str, alvo_id: str) -> str:
    return f"escopo:{escopo}:{alvo_id}"


def _db(db_path: Path | None) -> Path:
    return db_path if db_path is not None else channel_paths.settings_db_path()


def _ler_registro(escopo: str, alvo_id: str | None, db_path: Path | None) -> dict[str, dict]:
    banco = _db(db_path)
    if not alvo_id or not banco.exists():
        return {}
    return palco_do_escopo.normalizar(
        palco_componentes_store.ler_palco_componentes(banco, _chave(escopo, alvo_id))
    )


def ler_escolha(
    escopo: str, alvo_id: str | None, tipo: str, *, db_path: Path | None = None
) -> dict[str, Any]:
    """O que o projeto ou o corte escolheu para o tipo (vazio = herda)."""
    return _ler_registro(escopo, alvo_id, db_path).get(tipo, {})


def _acima(
    escopo: str, projeto_id: str | None, tipo: str, db_path: Path | None
) -> PalcoComponentes:
    """O palco do nível de cima: o canal, e o projeto quando o escopo é o corte."""
    canal = palco_componentes.ler_do_canal(db_path=db_path)
    if escopo == "projeto":
        return canal
    return palco_do_escopo.aplicar(canal, ler_escolha("projeto", projeto_id, tipo, db_path=db_path))


def gravar_escolha(
    escopo: str,
    alvo_id: str,
    tipo: str,
    componentes: dict[str, Any] | None,
    *,
    projeto_id: str | None = None,
    db_path: Path | None = None,
) -> dict[str, Any]:
    """Grava o palco do escopo: só o que difere do nível de cima. `None` volta a herdar."""
    registro = _ler_registro(escopo, alvo_id, db_path)
    acima = _acima(escopo, projeto_id, tipo, db_path)
    escolha = (
        palco_do_escopo.diferenca(acima.para_dict(), mesclar(acima, componentes).para_dict())
        if componentes
        else {}
    )
    if escolha:
        registro[tipo] = escolha
    else:
        registro.pop(tipo, None)
    palco_componentes_store.gravar_palco_componentes(
        _db(db_path), _chave(escopo, alvo_id), registro
    )
    return escolha


def resolver(
    projeto_id: str | None, corte_id: str | None, tipo: str, *, db_path: Path | None = None
) -> dict[str, Any]:
    """O palco que vale para o corte no tipo, de onde ele vem e o que cada nível escolheu."""
    do_projeto = ler_escolha("projeto", projeto_id, tipo, db_path=db_path)
    do_corte = ler_escolha("corte", corte_id, tipo, db_path=db_path)
    canal = palco_componentes.ler_do_canal(db_path=db_path)
    return {
        "tipo": tipo,
        "origem": palco_do_escopo.origem(do_projeto, do_corte),
        "efetivo": palco_do_escopo.aplicar(canal, do_projeto, do_corte),
        "projeto": do_projeto,
        "corte": do_corte,
    }


def fixar_para_render(
    projeto_id: str | None, corte_id: str | None, tipo: str, *, db_path: Path | None = None
) -> list[dict[str, Any]]:
    """Põe as escolhas do corte (sobre as do projeto) no contexto do render em curso.

    Sempre fixa, mesmo vazio: um worker que renderiza um corte depois do outro
    na mesma tarefa não pode herdar o palco do corte anterior.
    """
    escolhas = [
        e
        for e in (
            ler_escolha("projeto", projeto_id, tipo, db_path=db_path),
            ler_escolha("corte", corte_id, tipo, db_path=db_path),
        )
        if e
    ]
    channel_paths.PALCO_DO_CORTE_NO_RENDER.set(
        json.dumps(escolhas, sort_keys=True) if escolhas else ""
    )
    return escolhas


async def resolver_palco_do_short(short_id: str, corte: Any) -> dict:
    """O plano de palco do short, já com o palco do short do corte (D-923)."""
    from app.services import palco_shorts

    fixar_para_render(corte.projeto_id, corte.id, "short")
    return await palco_shorts.resolver_para_render(short_id)

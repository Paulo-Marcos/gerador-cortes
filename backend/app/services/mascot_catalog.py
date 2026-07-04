"""
Catalogo de poses do mascote do canal.

Le o JSON do catalogo na seguinte ordem de preferencia:
  1. instance/mascot/poses.json    — override da instancia (mascote do canal)
  2. app/data/mascote_poses.json   — espelho versionado (aceita ainda o nome
                                   legado app/data/sapo_poses.json como fallback;
                                   fonte primaria mantida no video-renderer,
                                   sincronizada manualmente quando o catalogo evolui)

Servico stateless, sem dependencia de banco de dados. Cacheia o conteudo
em memoria na primeira leitura.

TOLERANCIA (D-179): o mascote e OPCIONAL. Quando ele esta desabilitado
(`CANAL_MASCOTE_HABILITADO=false`) OU quando nao ha catalogo (nem override da
instancia nem espelho versionado), o servico degrada para um catalogo VAZIO em
vez de levantar excecao — assim o endpoint /api/mascot e o caminho de render nunca
quebram por ausencia do mascote.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.channel_paths import mascot_dir

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _espelho_versionado() -> Path:
    """Espelho versionado do catalogo: `mascote_poses.json`, com fallback legado.

    Prefere o nome generico (E-011) e cai em `sapo_poses.json` quando so este
    existir — nao regride canais cujo espelho ainda usa o nome legado.
    """
    novo = _DATA_DIR / "mascote_poses.json"
    if novo.is_file():
        return novo
    return _DATA_DIR / "sapo_poses.json"

_CATALOGO_VAZIO: dict[str, Any] = {
    "version": None,
    "atualizado_em": None,
    "descricao": "Mascote desabilitado ou catalogo ausente.",
    "poses": [],
}


def mascote_desabilitado() -> bool:
    """True quando o mascote foi explicitamente desligado via ambiente.

    Espelha, no backend, a chave que o frontend le como `VITE_CANAL_MASCOTE_HABILITADO`.
    Por nao-regressao, o catalogo continua sendo servido por padrao (o espelho
    versionado existe): so e suprimido quando `CANAL_MASCOTE_HABILITADO=false`.
    """
    return (os.getenv("CANAL_MASCOTE_HABILITADO") or "").strip().lower() == "false"


def _resolver_caminho() -> Path:
    """Caminho do catalogo: override da instancia se existir, senao o espelho versionado.

    O override resolve pela raiz do canal ativo (channel_paths.mascot_dir) — costura
    unica do epico Multi-canal. Hoje aponta para `<repo>/instance/mascot/poses.json`.
    """
    instance_path = mascot_dir() / "poses.json"
    if instance_path.is_file():
        return instance_path
    return _espelho_versionado()


def _carregar_arquivo() -> dict[str, Any]:
    if mascote_desabilitado():
        return dict(_CATALOGO_VAZIO)
    caminho = _resolver_caminho()
    if not caminho.exists():
        # Tolerancia (D-179): sem catalogo (instance nem espelho) degrada para vazio
        # em vez de derrubar o endpoint/render — o mascote e opcional.
        return dict(_CATALOGO_VAZIO)
    with caminho.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _catalogo() -> dict[str, Any]:
    return _carregar_arquivo()


def listar_poses(cena: str | None = None) -> list[dict[str, Any]]:
    """
    Retorna todas as poses do catalogo, ou apenas as compativeis com `cena`
    quando informado.
    """
    poses = _catalogo()["poses"]
    if cena is None:
        return list(poses)
    return [p for p in poses if cena in p.get("cenas", [])]


def buscar_pose(mood: str) -> dict[str, Any] | None:
    """Procura uma pose pelo identificador `mood`. None se nao existir."""
    for pose in _catalogo()["poses"]:
        if pose["mood"] == mood:
            return pose
    return None


def metadata() -> dict[str, Any]:
    """Devolve os campos de cabecalho do catalogo (versao, data, descricao)."""
    cat = _catalogo()
    return {
        "version": cat.get("version"),
        "atualizado_em": cat.get("atualizado_em"),
        "descricao": cat.get("descricao"),
        "total": len(cat.get("poses", [])),
    }


def recarregar() -> None:
    """Limpa o cache em memoria. Util quando o JSON e atualizado em runtime."""
    _catalogo.cache_clear()

"""Uma versão só para o app inteiro (D-686).

Antes da 0.3.0 o mesmo app declarava três: 0.2.0 no frontend, 1.0.0 no
renderer e 1.0.0 na API. A fonte é o `VERSION` da raiz; os manifestos do npm
precisam da versão dentro de si e ficam como cópias conferidas aqui.
"""

import json
import re
from pathlib import Path

from app.config import VERSAO_DO_APP

RAIZ = Path(__file__).resolve().parents[2]
_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def _versao_do_json(caminho: str, *chaves: str) -> str:
    dados = json.loads((RAIZ / caminho).read_text(encoding="utf-8"))
    for chave in chaves:
        dados = dados[chave]
    return dados["version"]


def test_version_e_semver_e_e_a_da_api():
    versao = (RAIZ / "VERSION").read_text(encoding="utf-8").strip()
    assert _SEMVER.match(versao), f"VERSION deve ser X.Y.Z, veio {versao!r}"
    assert VERSAO_DO_APP == versao


def test_manifestos_repetem_a_versao():
    copias = {
        "frontend/package.json": _versao_do_json("frontend/package.json"),
        "frontend/package-lock.json": _versao_do_json("frontend/package-lock.json"),
        "frontend/package-lock.json (raiz)": _versao_do_json(
            "frontend/package-lock.json", "packages", ""
        ),
        "video-renderer/package.json": _versao_do_json("video-renderer/package.json"),
        "video-renderer/package-lock.json": _versao_do_json("video-renderer/package-lock.json"),
        "video-renderer/package-lock.json (raiz)": _versao_do_json(
            "video-renderer/package-lock.json", "packages", ""
        ),
        "backend/openapi.json": _versao_do_json("backend/openapi.json", "info"),
    }
    divergentes = {nome: v for nome, v in copias.items() if v != VERSAO_DO_APP}
    assert not divergentes, f"VERSION diz {VERSAO_DO_APP}; divergem: {divergentes}"

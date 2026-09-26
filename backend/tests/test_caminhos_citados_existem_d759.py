"""Todo arquivo do backend citado pelo frontend ou pelo renderer existe (D-759).

Os testes de acordo dos shorts leem arquivos do domínio pelo caminho, e os
comentários "espelha `app/domain/...`" dizem de onde vem cada número. Mover um
módulo reescrevia as referências do backend e esquecia as de fora — e só o CI do
frontend via, um push depois. Esta varredura faz o próprio backend reprovar o
movimento que deixa um caminho citado apontando para o nada.
"""

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

_REPO = Path(__file__).resolve().parents[2]
_BACKEND = _REPO / "backend"
# `backend/app/...` em qualquer posição (os testes montam `../../backend/app/...`);
# `app/...` solto só quando não é pedaço de outro caminho.
_CITACAO = re.compile(r"(?:backend/|(?<![\w/]))(app/[a-z_/]+\.py)\b")
_EXTENSOES = {".ts", ".tsx", ".js", ".mjs", ".cjs"}


def _fontes_de_fora() -> list[Path]:
    fontes = [
        p
        for raiz in (_REPO / "frontend" / "src", _REPO / "video-renderer" / "src")
        for p in raiz.rglob("*")
        if p.suffix in _EXTENSOES and "node_modules" not in p.parts
    ]
    return fontes + [p for p in (_REPO / "video-renderer").glob("*.js")]


def test_os_caminhos_do_backend_citados_fora_dele_existem():
    quebrados = [
        f"{fonte.relative_to(_REPO).as_posix()}: {caminho}"
        for fonte in _fontes_de_fora()
        for caminho in _CITACAO.findall(fonte.read_text(encoding="utf-8", errors="replace"))
        if not (_BACKEND / caminho).is_file()
    ]

    assert not quebrados, "Caminhos citados que não existem mais:\n" + "\n".join(quebrados)


def test_a_varredura_enxerga_as_citacoes_de_verdade():
    """Uma varredura que nunca acha nada não guarda nada."""
    citados = {
        c for f in _fontes_de_fora() for c in _CITACAO.findall(f.read_text("utf-8", "replace"))
    }

    assert "app/domain/short/gancho_short.py" in citados  # comentário "espelha"
    assert "app/domain/publicacao/publicacao.py" in citados  # leitura do teste de acordo

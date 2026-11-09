"""D-1080: a documentação viva de travas diz o mesmo que o `registry.yaml`.

Desde a D-925 a única trava é a dos testes, e criar arquivo novo é livre. A
documentação continuou citando a trava `adicoes-exigem-autorizacao`, que já
não existia, e enganou um agente que a seguiu. Este teste lê os ids do
registro de verdade e reprova o documento vivo que cita uma trava inexistente
ou que diz que arquivo novo é trava enquanto nenhuma trava bloqueia `add`.

Documento vivo é todo `.md` e `.txt` versionado, menos o que é histórico:
`docs/interno/`, `.guia/reports/`, os CHANGELOG e `.guia/locks/exceptions.md`.
A citação é a marca `[unlock:<id>]` (o mesmo padrão do `bin/check-lock.py`)
ou a afirmação "trava (`id`)", "lock global `id`", "lock-curinga `id`". Os ids
de exemplo do README de travas ficam numa lista explícita.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest
import yaml

_RAIZ = Path(__file__).resolve().parents[2]
_REGISTRO = _RAIZ / ".guia" / "locks" / "registry.yaml"

_HISTORICO_PREFIXOS = ("docs/interno/", ".guia/reports/")
_HISTORICO_ARQUIVOS = {".guia/locks/exceptions.md"}
# Ids inventados que o README usa para explicar o mecanismo (lock, unlock, audit).
_EXEMPLOS_DO_README = {
    ".guia/locks/README.md": {"ingestao-livestream", "export-losslesscut"},
}

_ID = r"[a-z0-9_]+(?:-[a-z0-9_]+)+"
_UNLOCK = re.compile(r"\[unlock:([a-z0-9_\-]+)\]", re.IGNORECASE)
_CITACAO_DE_TRAVA = re.compile(
    rf"\b(?:trava|lock)(?:-curinga|\s+global)?\s*\(?\s*`({_ID})`",
    re.IGNORECASE,
)
# "Arquivo novo também é trava", "Criar qualquer arquivo novo também é travado".
_ARQUIVO_NOVO_E_TRAVA = re.compile(
    r"arquivos?\s+novos?[^.\n]{0,20}\b(?:é|são)\s+trava",
    re.IGNORECASE,
)


def _documentos_vivos() -> list[str]:
    saida = subprocess.run(
        ["git", "ls-files", "*.md", "*.txt"],
        cwd=_RAIZ,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
        check=True,
    ).stdout
    return sorted(
        caminho
        for caminho in saida.splitlines()
        if caminho
        and not caminho.startswith(_HISTORICO_PREFIXOS)
        and caminho not in _HISTORICO_ARQUIVOS
        and not Path(caminho).name.startswith("CHANGELOG")
    )


DOCUMENTOS_VIVOS = _documentos_vivos()


def _travas() -> list[dict]:
    return yaml.safe_load(_REGISTRO.read_text(encoding="utf-8"))["locks"]


def _ler(documento: str) -> str:
    return (_RAIZ / documento).read_text(encoding="utf-8")


def _travas_citadas(texto: str) -> set[str]:
    return set(_CITACAO_DE_TRAVA.findall(texto)) | set(_UNLOCK.findall(texto))


def test_citacao_de_trava_e_reconhecida():
    """Controle: sem isto, um regex que nunca casa deixaria o teste verde."""
    texto = (
        "Arquivo novo também é trava (`adicoes-exigem-autorizacao`). O lock global `x-y`. "
        "O commit leva `[unlock:trava_antiga-b]` ao criar arquivo."
    )
    assert _travas_citadas(texto) == {"adicoes-exigem-autorizacao", "x-y", "trava_antiga-b"}
    assert _ARQUIVO_NOVO_E_TRAVA.search("Criar qualquer arquivo novo também é travado.")


def test_varredura_pega_os_documentos_de_travas():
    """Controle: a varredura do git enxerga os documentos que falam de trava."""
    for documento in ("AGENTS.md", ".guia/locks/README.md", ".githooks/README.md"):
        assert documento in DOCUMENTOS_VIVOS
    assert not any(doc.startswith("docs/interno/") for doc in DOCUMENTOS_VIVOS)


@pytest.mark.parametrize("documento", DOCUMENTOS_VIVOS)
def test_documento_so_cita_trava_que_existe(documento):
    ids = {trava["id"] for trava in _travas()}
    exemplos = _EXEMPLOS_DO_README.get(documento, set())
    inexistentes = _travas_citadas(_ler(documento)) - ids - exemplos
    assert not inexistentes, f"{documento} cita trava fora do registry.yaml: {sorted(inexistentes)}"


@pytest.mark.parametrize("documento", DOCUMENTOS_VIVOS)
def test_documento_nao_trava_arquivo_novo_sem_trava_de_add(documento):
    if any("add" in trava.get("operations", ["add"]) for trava in _travas()):
        pytest.skip("o registry.yaml tem trava de add: a frase voltaria a ser verdade")
    achado = _ARQUIVO_NOVO_E_TRAVA.search(_ler(documento))
    assert not achado, f"{documento} diz que arquivo novo é trava: {achado.group(0)!r}"

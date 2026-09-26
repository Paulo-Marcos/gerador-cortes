"""Nenhum arquivo versionado com texto corrompido por encoding (D-668).

Commits de um agente regravaram arquivos .tsx em cp1252: os acentos viraram
lixo e nem tsc, nem eslint, nem vitest reclamaram — o código continuava
compilando. Este teste varre os arquivos de texto do repositório inteiro
(backend, frontend e renderer) e falha em dois casos:

- o arquivo não é UTF-8 (foi regravado em cp1252/latin-1);
- o arquivo é UTF-8, mas carrega o rastro de um UTF-8 lido errado e regravado:
  U+00C3 ou U+00C2 seguidos de U+0080..U+00BF, a dupla U+00E2 U+20AC (aspas
  e travessões quebrados) ou o caractere de substituição U+FFFD.

Os padrões abaixo são montados com chr() de propósito: com o caractere
literal, este arquivo acusaria a si mesmo.
"""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration  # varre o repositório inteiro via git (D-751)

RAIZ = Path(__file__).resolve().parents[2]
EXTENSOES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".css",
    ".html",
    ".toml",
    ".ps1",
    ".sh",
}
# Montado com chr(): em escapes \u o `ruff format` troca pelo caractere
# literal, e o arquivo passaria a acusar a si mesmo.
_FAIXA = f"[{chr(0x80)}-{chr(0xBF)}]"
SINAIS = re.compile(
    f"{chr(0xC3)}{_FAIXA}|{chr(0xC2)}{_FAIXA}|{chr(0xE2)}{chr(0x20AC)}|{chr(0xFFFD)}"
)


def _problemas_do_texto(bruto: bytes) -> list[str]:
    """Descreve o que há de errado num arquivo; lista vazia = sadio."""
    try:
        texto = bruto.decode("utf-8")
    except UnicodeDecodeError as erro:
        return [f"não é UTF-8 (byte {erro.start}: {bruto[erro.start : erro.start + 1]!r})"]
    problemas = []
    for numero, linha in enumerate(texto.splitlines(), 1):
        achado = SINAIS.search(linha)
        if achado:
            inicio = max(0, achado.start() - 20)
            problemas.append(f"linha {numero}: …{linha[inicio : achado.end() + 20].strip()}…")
    return problemas


def _arquivos_versionados() -> list[Path]:
    saida = subprocess.run(
        ["git", "ls-files", "-z"], cwd=RAIZ, capture_output=True, check=True
    ).stdout
    caminhos = (RAIZ / p for p in saida.decode("utf-8").split("\0") if p)
    return [c for c in caminhos if c.suffix in EXTENSOES and c.is_file()]


@pytest.mark.skipif(shutil.which("git") is None, reason="git não está no PATH")
def test_nenhum_arquivo_versionado_tem_texto_corrompido():
    corrompidos = {}
    for caminho in _arquivos_versionados():
        problemas = _problemas_do_texto(caminho.read_bytes())
        if problemas:
            corrompidos[caminho.relative_to(RAIZ).as_posix()] = problemas[:3]

    assert not corrompidos, "Texto corrompido por encoding:\n" + "\n".join(
        f"  {arquivo}: {'; '.join(problemas)}" for arquivo, problemas in corrompidos.items()
    )


class TestODetectorVeOEstrago:
    """Um guarda que nunca acusa não guarda nada: fabrica o estrago e confere."""

    ORIGINAL = "Revisão de ação — “ok” até já"

    def test_texto_sadio_passa(self):
        assert _problemas_do_texto(self.ORIGINAL.encode("utf-8")) == []

    def test_utf8_lido_como_cp1252_e_regravado_e_acusado(self):
        estragado = self.ORIGINAL.encode("utf-8").decode("cp1252", errors="replace")

        problemas = _problemas_do_texto(estragado.encode("utf-8"))

        assert problemas and problemas[0].startswith("linha 1:")

    def test_arquivo_regravado_em_cp1252_e_acusado(self):
        problemas = _problemas_do_texto(self.ORIGINAL.encode("cp1252"))

        assert problemas and problemas[0].startswith("não é UTF-8")

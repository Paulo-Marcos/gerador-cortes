"""Nenhum arquivo versionado com texto corrompido por encoding (D-668).

Commits de um agente regravaram arquivos .tsx em cp1252: os acentos viraram
lixo e nem tsc, nem eslint, nem vitest reclamaram — o código continuava
compilando. Este teste varre os arquivos de texto do repositório inteiro
(backend, frontend e renderer) e falha em dois casos:

- o arquivo não é UTF-8 (foi regravado em cp1252/latin-1);
- o arquivo é UTF-8, mas carrega o rastro de um UTF-8 lido errado e regravado:
  U+00C3 ou U+00C2 seguidos de U+0080..U+00BF, a dupla U+00E2 U+20AC (aspas
  e travessões quebrados) ou o caractere de substituição U+FFFD;
- o texto tem caractere de controle (backspace e afins), rastro da barra
  invertida de um caminho do Windows interpretada como escape dentro de uma
  string — "bin", barra, "bootstrap" vira "bin" + backspace (D-779).

E um terceiro, só para `.ps1`: script com acento precisa de BOM, senão o
Windows PowerShell 5.1 o lê como ANSI (D-779).

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
    # Caractere de controle (menos tab): um caminho do Windows escrito por
    # agente numa string Python perde a barra — "\b" vira backspace (D-779).
    f"|[{chr(0x00)}-{chr(0x08)}{chr(0x0E)}-{chr(0x1F)}{chr(0x7F)}]"
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


def _ps1_sem_bom_com_acento(bruto: bytes) -> bool:
    """O Windows PowerShell 5.1 lê .ps1 sem BOM como ANSI (cp1252): o acento de
    uma mensagem sai quebrado na tela sem erro nenhum (D-779). Com BOM UTF-8, o
    5.1 e o pwsh 7 leem igual; sem acento, o BOM é indiferente."""
    return not bruto.startswith(b"\xef\xbb\xbf") and any(byte > 0x7F for byte in bruto)


@pytest.mark.skipif(shutil.which("git") is None, reason="git não está no PATH")
def test_script_powershell_com_acento_tem_bom():
    sem_bom = [
        caminho.relative_to(RAIZ).as_posix()
        for caminho in _arquivos_versionados()
        if caminho.suffix == ".ps1" and _ps1_sem_bom_com_acento(caminho.read_bytes())
    ]

    assert not sem_bom, (
        f"Salve como UTF-8 com BOM (o PowerShell 5.1 lê sem BOM como ANSI): {sem_bom}"
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

    def test_caractere_de_controle_e_acusado(self):
        # D-779: "bin\bootstrap" escrito por agente numa string Python virou
        # "bin" + backspace + "ootstrap" — duas vezes na mesma sessão.
        problemas = _problemas_do_texto(f"use bin{chr(8)}ootstrap.ps1\n".encode())

        assert problemas and problemas[0].startswith("linha 1:")

    def test_tab_e_quebra_de_linha_nao_sao_acusados(self):
        assert _problemas_do_texto(b"a\tb\r\nc\n") == []

    def test_ps1_com_acento_sem_bom_e_acusado_e_com_bom_passa(self):
        script = 'Write-Host "Revisão"'.encode()

        assert _ps1_sem_bom_com_acento(script)
        assert not _ps1_sem_bom_com_acento(b"\xef\xbb\xbf" + script)
        assert not _ps1_sem_bom_com_acento(b'Write-Host "ok"')

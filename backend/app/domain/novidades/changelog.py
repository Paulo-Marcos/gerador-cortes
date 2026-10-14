"""Lê o CHANGELOG e os fragmentos de `changelog.d/` como entradas (D-922).

O CHANGELOG é a fonte única do que mudou: a tela de Novidades não guarda texto
próprio, só a tradução de cada entrada. Por isso a entrada tem uma `chave` que
depende só do TEXTO, com o espaço normalizado: quando a release compila um
fragmento no CHANGELOG e quebra as linhas de outro jeito, a chave continua a
mesma, e a tradução e o "já vi" seguem valendo.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

# A seção do que já está na `main` e ainda não ganhou número.
SEM_VERSAO = "Unreleased"

_VERSAO = re.compile(r"^## \[(?P<versao>[^\]]+)\](?: - (?P<data>\d{4}-\d{2}-\d{2}))?")
_CATEGORIA = re.compile(r"^### (?P<categoria>\w+)")
_FRAGMENTO = re.compile(r"^(?P<demanda>[A-Za-z]+-\d+)\.(?P<categoria>[a-z]+)\.md$")
_TITULO = re.compile(r"^\*\*(?P<titulo>.+?)\*\*")
_DEMANDA = re.compile(r"\b[DEI]-\d{3,}\b")


@dataclass(frozen=True)
class Entrada:
    chave: str
    categoria: str
    titulo: str
    texto: str
    demandas: tuple[str, ...]


@dataclass(frozen=True)
class Versao:
    versao: str
    data: str | None
    entradas: tuple[Entrada, ...]


def chave_do_texto(texto: str) -> str:
    """Identidade da entrada: o texto sem diferença de quebra de linha."""
    normalizado = " ".join(texto.split())
    return hashlib.sha256(normalizado.encode("utf-8")).hexdigest()[:16]


def montar_entrada(categoria: str, linhas: list[str]) -> Entrada:
    texto = "\n".join(linha.strip() for linha in linhas).strip()
    titulo = _TITULO.match(texto)
    return Entrada(
        chave=chave_do_texto(texto),
        categoria=categoria.lower(),
        titulo=titulo.group("titulo") if titulo else texto.split("\n", 1)[0],
        texto=texto,
        demandas=tuple(dict.fromkeys(_DEMANDA.findall(texto))),
    )


def separar_itens(linhas: list[str]) -> list[list[str]]:
    """Cada `- ` na margem abre um item; as linhas recuadas o continuam."""
    itens: list[list[str]] = []
    for linha in linhas:
        if linha.startswith("- "):
            itens.append([linha[2:]])
        elif itens and linha.strip():
            itens[-1].append(linha)
    return itens


def ler_changelog(conteudo: str) -> list[Versao]:
    """As versões na ordem do arquivo (a mais nova primeiro), com as entradas."""
    versoes: list[Versao] = []
    atual: tuple[str, str | None] | None = None
    entradas: list[Entrada] = []
    categoria = ""
    bloco: list[str] = []

    def fechar_bloco() -> None:
        if atual and categoria:
            entradas.extend(montar_entrada(categoria, item) for item in separar_itens(bloco))
        bloco.clear()

    for linha in conteudo.splitlines():
        versao = _VERSAO.match(linha)
        secao = _CATEGORIA.match(linha)
        if versao:
            fechar_bloco()
            if atual:
                versoes.append(Versao(atual[0], atual[1], tuple(entradas)))
            atual, entradas, categoria = (versao["versao"], versao["data"]), [], ""
        elif secao:
            fechar_bloco()
            categoria = secao["categoria"]
        else:
            bloco.append(linha)
    fechar_bloco()
    if atual:
        versoes.append(Versao(atual[0], atual[1], tuple(entradas)))
    return versoes


def ler_fragmentos(fragmentos: dict[str, str]) -> list[Entrada]:
    """Os fragmentos `<ID>.<categoria>.md`, da demanda mais nova para a mais velha.

    Nome fora do padrão fica de fora: é o mesmo critério do `bin/release.py`.
    """
    validos = [
        (nome, achado, conteudo)
        for nome, conteudo in fragmentos.items()
        if (achado := _FRAGMENTO.match(nome))
    ]
    validos.sort(key=lambda trio: int(trio[1]["demanda"].split("-")[1]), reverse=True)
    return [
        montar_entrada(achado["categoria"], item)
        for _nome, achado, conteudo in validos
        for item in separar_itens(conteudo.splitlines())
    ]


def juntar(versoes: list[Versao], fragmentos: list[Entrada]) -> list[Versao]:
    """Os fragmentos ainda não compilados entram no topo da seção sem versão."""
    if not fragmentos:
        return versoes
    restantes = [v for v in versoes if v.versao != SEM_VERSAO]
    sem_versao = next((v for v in versoes if v.versao == SEM_VERSAO), None)
    ja_compiladas = tuple(sem_versao.entradas) if sem_versao else ()
    chaves = {e.chave for e in ja_compiladas}
    novas = tuple(e for e in fragmentos if e.chave not in chaves)
    return [Versao(SEM_VERSAO, None, novas + ja_compiladas), *restantes]

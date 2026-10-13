"""As fotos do apresentador que vão junto da capa gerada no ChatGPT (D-909).

## O rótulo é o nome do arquivo

O operador cultiva um banco de fotos do apresentador das lives, uma por
expressão: `pensativo.jpg`, `indignado-2.png`, `rindo.webp`. Não há cadastro: o
nome diz a expressão, e o sufixo numérico só separa duas fotos da mesma
expressão. Assim, trocar ou acrescentar uma expressão é subir um arquivo.

## Quem escolhe

O Capista, que leu o corte, declara as expressões que a capa pede numa linha
própria do prompt: `[APRESENTADOR="pensativo, indignado"]`. Aqui elas se casam
com os rótulos, e o que faltar se completa por sorteio DETERMINÍSTICO: a
semente sai do prompt, então o mesmo prompt anexa sempre as mesmas fotos, e
cortes diferentes não anexam sempre as mesmas três.

Puro: recebe nomes de arquivo e devolve nomes de arquivo, sem disco.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from collections.abc import Iterable, Sequence

from app.domain.compartilhado.erros import PedidoInvalido

# Três rostos já dão ao ChatGPT o traço e a expressão; mais que isso disputa a
# atenção com a cena (o mesmo motivo do teto de pessoas reais, D-840).
MAXIMO_DE_FOTOS_POR_CAPA = 3
# O banco é de expressões, não um álbum: quarenta cobre todas com folga.
MAXIMO_DE_FOTOS_NO_BANCO = 40
EXTENSOES_DE_FOTO = (".png", ".jpg", ".jpeg", ".webp")

MARCA_DA_LINHA = "[APRESENTADOR"

_NAO_ALFANUMERICO = re.compile(r"[^a-z0-9]+")
_SUFIXO_NUMERICO = re.compile(r"-\d+$")
_SEPARADOR_DE_EXPRESSOES = re.compile(r"[,;|/]")


def _sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in decomposto if not unicodedata.combining(c))


def _normalizar(texto: str) -> str:
    """Minúsculas, sem acento, palavras unidas por hífen.

    >>> _normalizar("  Indignação  Total ")
    'indignacao-total'
    """
    return _NAO_ALFANUMERICO.sub("-", _sem_acento(texto).casefold()).strip("-")


def rotulo_da_foto(nome_do_arquivo: str) -> str:
    """A expressão que o nome do arquivo declara.

    >>> rotulo_da_foto("Indignado-2.PNG")
    'indignado'
    >>> rotulo_da_foto("sorrindo_de_canto 3.jpg")
    'sorrindo-de-canto'
    """
    raiz = nome_do_arquivo.rsplit(".", 1)[0] if "." in nome_do_arquivo else nome_do_arquivo
    return _SUFIXO_NUMERICO.sub("", _normalizar(raiz))


def nome_de_foto_valido(nome: str) -> str:
    """O nome em disco de uma foto enviada, ou `PedidoInvalido`.

    Normaliza sem perder o rótulo: acento sai ("indignação" vira "indignacao"),
    em vez de virar hífen, porque o nome É o rótulo. Sem barra e sem `..`: o
    nome vira caminho.

    >>> nome_de_foto_valido("fotos/Indignação 2.JPG")
    'indignacao-2.jpg'
    """
    base = (nome or "").strip().replace("\\", "/").rsplit("/", 1)[-1]
    raiz, _, extensao = base.rpartition(".")
    extensao = f".{extensao.lower()}"
    if not raiz or extensao not in EXTENSOES_DE_FOTO:
        raise PedidoInvalido("A foto precisa ser uma imagem PNG, JPG ou WEBP.")
    raiz = _normalizar(raiz)
    if not raiz:
        raise PedidoInvalido("Dê à foto o nome da expressão, como pensativo.jpg.")
    return f"{raiz}{extensao}"


def rotulos_disponiveis(arquivos: Iterable[str]) -> list[str]:
    """As expressões do banco, sem repetição, em ordem alfabética."""
    return sorted({rotulo_da_foto(nome) for nome in arquivos} - {""})


def expressoes_do_prompt(prompt: str) -> list[str]:
    """As expressões que o Capista pediu na linha `[APRESENTADOR="..."]`.

    Por comparação de texto e `split`, sem regex sobre o prompt: ele chega pela
    requisição (o mesmo cuidado de `variacao_prompt.pessoas_do_prompt`).

    >>> expressoes_do_prompt('[VARIATION_TAGS] x="y"\\n[APRESENTADOR="Pensativo, indignado"]')
    ['pensativo', 'indignado']
    """
    linha = next(
        (
            lin.strip()
            for lin in (prompt or "").splitlines()
            if lin.lstrip().startswith(MARCA_DA_LINHA)
        ),
        "",
    )
    abre, fecha = linha.find('"'), linha.rfind('"')
    if abre == fecha:  # sem aspas, ou só a de abrir: linha quebrada
        return []
    valor = linha[abre + 1 : fecha]
    expressoes: list[str] = []
    for bruto in _SEPARADOR_DE_EXPRESSOES.split(valor):
        expressao = _normalizar(bruto)
        if expressao and expressao not in expressoes:
            expressoes.append(expressao)
    return expressoes


def semente_do_prompt(prompt: str) -> int:
    """Um número estável por prompt: o mesmo prompt, as mesmas fotos."""
    return int(hashlib.sha256((prompt or "").encode("utf-8")).hexdigest()[:12], 16)


def _casa(rotulo: str, expressao: str) -> bool:
    """O rótulo atende a expressão: igual, ou a expressão é o começo dele.

    "sorrindo" atende a quem pediu "sorrindo", e também "sorrindo-de-canto"; o
    contrário não, porque quem pediu o detalhe não aceita o genérico.
    """
    return rotulo == expressao or rotulo.startswith(f"{expressao}-")


def _embaralhar(nomes: Iterable[str], semente: int) -> list[str]:
    return sorted(nomes, key=lambda nome: hashlib.sha256(f"{semente}:{nome}".encode()).hexdigest())


def escolher_fotos(
    expressoes: Sequence[str],
    arquivos: Iterable[str],
    *,
    semente: int,
    maximo: int = MAXIMO_DE_FOTOS_POR_CAPA,
) -> list[str]:
    """Até `maximo` fotos: primeiro as que atendem as expressões, na ordem pedida.

    Entre duas fotos da mesma expressão, a semente decide qual vai. O que
    faltar se completa com o resto do banco embaralhado pela semente, dando
    preferência a expressões ainda não escolhidas — três fotos do mesmo rosto
    sério ensinam menos ao gerador que três expressões diferentes.
    """
    banco = _embaralhar(set(arquivos), semente)
    escolhidas: list[str] = []
    for expressao in (_normalizar(e) for e in expressoes):
        if len(escolhidas) == maximo:
            break
        achada = next(
            (n for n in banco if n not in escolhidas and _casa(rotulo_da_foto(n), expressao)),
            None,
        )
        if achada:
            escolhidas.append(achada)

    restantes = [n for n in banco if n not in escolhidas]
    while len(escolhidas) < maximo and restantes:
        usados = {rotulo_da_foto(n) for n in escolhidas}
        proxima = next((n for n in restantes if rotulo_da_foto(n) not in usados), restantes[0])
        escolhidas.append(proxima)
        restantes.remove(proxima)
    return escolhidas

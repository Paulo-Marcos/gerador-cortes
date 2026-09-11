"""O texto de PUBLICACAO de um short (D-565, onda 3).

## Por que nao serve o que ja havia

Ate aqui o post do short saia de dois campos escritos para OUTRO leitor:
`titulo_sugerido` e `gancho`, ambos produzidos pela skill de shorts para o
operador escolher entre candidatos na tela de curadoria. Sao bons nisso — e por
isso mesmo nao servem no feed, onde quem le e o espectador.

## Os tres textos, e o que cada um faz

- **titulo** — no YouTube Shorts ele aparece abaixo do video, com ~40 dos 100
  caracteres visiveis antes do corte; no TikTok e no Reels nao existe campo de
  titulo, e ele vira a primeira linha da legenda (`caixa_unica`). Escrever um
  texto por plataforma seria refazer a mao o que `publicacao.adaptar` ja faz.
- **descricao** — o contexto de quem ja parou, e onde entra o link do corte
  longo. O short e funil; sem o link ele nao leva a lugar nenhum.
- **hashtags** — descoberta. Cada plataforma tem seu teto (3 no Shorts, 5 no
  TikTok, 10 no Reels), e `adaptar` corta; aqui so garantimos que sao termos
  utilizaveis, e nao uma frase com `#` na frente.

## E o gancho? Nao e o titulo

Tentador reusar, e errado: sao leitores diferentes. O gancho e lido ANTES, por
quem esta com o dedo em movimento e decide em tres segundos; o titulo e lido
DEPOIS, por quem ja parou. O gancho entra no prompt como materia-prima — nunca
como resposta pronta.

Modulo puro: so texto. Sem I/O, sem banco, sem plataforma.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

# Teto de seguranca, nao regra editorial. O limite real por plataforma vive em
# `publicacao.LIMITES` e e aplicado por `adaptar` — este aqui so impede que um
# ensaio inteiro chegue ao banco. O menor titulo_max do catalogo e 100 (Shorts);
# folga para as plataformas de caixa unica, que aceitam milhares.
MAX_TITULO = 300
MAX_DESCRICAO = 5000

# Acima disso o texto deixa de ser descoberta e vira spam — e as plataformas
# escondem o excesso de qualquer forma. `adaptar` ainda corta pelo teto de cada
# uma; este e o teto do que se GRAVA.
MAX_HASHTAGS = 10

# Uma hashtag e um termo, nao uma frase. O que sobra depois desta limpeza e o
# que a plataforma consegue indexar.
_SO_PALAVRA = re.compile(r"[^0-9A-Za-zÀ-ÿ]+")


@dataclass(frozen=True)
class PostDoShort:
    """O que vai para o feed, antes de ser adaptado a cada plataforma."""

    titulo: str = ""
    descricao: str = ""
    hashtags: list[str] = field(default_factory=list)

    @property
    def vazio(self) -> bool:
        """Sem titulo nao ha post — descricao e hashtags nao sustentam um sozinhas."""
        return not self.titulo.strip()


def normalizar_hashtag(bruta: str) -> str:
    """Uma hashtag utilizavel a partir do que o modelo escreveu.

    Devolve SEM o `#`: quem o acrescenta e `publicacao._normalizar_hashtags`, e
    guardar o simbolo aqui produziria `##juros` la na frente.

    >>> normalizar_hashtag('#JuroComposto')
    'JuroComposto'
    >>> normalizar_hashtag('  taxa de juros  ')
    'taxadejuros'
    >>> normalizar_hashtag('###')
    ''
    """
    return _SO_PALAVRA.sub("", (bruta or "").strip())


def normalizar_hashtags(brutas: object) -> list[str]:
    """A lista limpa, sem repetidas e dentro do teto.

    Aceita lista ou string separada por espaco/virgula: o modelo escorrega entre
    as duas formas, e recusar por isso perderia a geracao inteira.

    >>> normalizar_hashtags(['#juros', 'juros', 'Selic'])
    ['juros', 'Selic']
    >>> normalizar_hashtags('#juros #selic')
    ['juros', 'selic']
    >>> normalizar_hashtags(None)
    []
    """
    if isinstance(brutas, str):
        itens: list[object] = re.split(r"[\s,]+", brutas)
    elif isinstance(brutas, list):
        itens = list(brutas)
    else:
        return []

    limpas: list[str] = []
    vistas: set[str] = set()
    for item in itens:
        tag = normalizar_hashtag(str(item))
        if not tag or tag.lower() in vistas:
            continue
        vistas.add(tag.lower())
        limpas.append(tag)
        if len(limpas) == MAX_HASHTAGS:
            break
    return limpas


def hashtags_gravadas(bruto_json: object) -> list[str]:
    """As hashtags que estao no banco, a partir do JSON gravado.

    Existe porque o campo e lido em DOIS lugares — a tela (que as mostra para
    edicao) e a publicacao (que as manda a plataforma) — e as duas leituras ja
    tinham comecado a divergir no tratamento de erro. JSON quebrado vira lista
    vazia nas duas: uma tag corrompida nao pode impedir a publicacao de um video
    que esta pronto.

    >>> hashtags_gravadas('["juros", "selic"]')
    ['juros', 'selic']
    >>> hashtags_gravadas('{quebrado')
    []
    >>> hashtags_gravadas(None)
    []
    """
    try:
        valor = json.loads(bruto_json or "[]")  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return []
    return [str(item) for item in valor] if isinstance(valor, list) else []


def post_da_resposta(bruto: object) -> PostDoShort:
    """O post dentro do que o modelo devolveu.

    Aceita o dict ja desserializado ou o texto cru com o JSON dentro — modelos
    embrulham em ```json com frequencia, e o contrato de saida e promessa, nao
    garantia (a licao que a etiqueta da capa aprendeu na D-520).

    Devolve um post VAZIO quando nada aproveitavel veio. A tela diz que nao saiu
    nada, e a publicacao cai no comportamento de antes — que e melhor que gravar
    um titulo inventado por cima do que o operador ja tinha.

    >>> post_da_resposta('{"titulo": "Um titulo", "hashtags": ["#juros"]}').titulo
    'Um titulo'
    >>> post_da_resposta('```json\\n{"titulo": "Com cerca"}\\n```').titulo
    'Com cerca'
    >>> post_da_resposta('nao e json nenhum').vazio
    True
    """
    dados = bruto if isinstance(bruto, dict) else _json_de(str(bruto or ""))
    if not isinstance(dados, dict):
        return PostDoShort()

    return PostDoShort(
        titulo=_texto(dados.get("titulo"), MAX_TITULO),
        descricao=_texto(dados.get("descricao"), MAX_DESCRICAO),
        hashtags=normalizar_hashtags(dados.get("hashtags")),
    )


def _texto(valor: object, teto: int) -> str:
    """Um campo de texto do JSON, colapsado e dentro do teto de seguranca."""
    if not isinstance(valor, str):
        return ""
    limpo = valor.strip()
    return limpo[:teto]


def _json_de(texto: str) -> object:
    """O primeiro objeto JSON dentro do texto, ou `None`.

    Procura pelo par de chaves mais externo em vez de exigir que a resposta
    inteira seja JSON: e comum o modelo escrever uma linha antes ou depois, e
    perder a geracao por causa dela seria caro por nada.
    """
    inicio = texto.find("{")
    fim = texto.rfind("}")
    if inicio < 0 or fim <= inicio:
        return None
    try:
        return json.loads(texto[inicio : fim + 1])
    except (ValueError, TypeError):
        return None

"""Como a tela do short é montada: modo, disposição e de onde vem cada janela (E-038, D-507).

Substitui a escolha entre quatro MODELOS por duas perguntas, que é o que ela
sempre foi por baixo.

## O que estava embolado

A tela pedia três coisas que pareciam irmãs e não eram:

  - `enquadramento` (foco_x) — onde a janela 9:16 se centra no quadro cru;
  - `recorte` — que pedaço da live cada bloco mostra;
  - `arranjo` — qual dos quatro modelos.

O primeiro e o segundo **nunca agem juntos**: `foco_x` só vale quando não há
região marcada. O painel mostrava dois controles com um sempre morto, e sem
dizer qual. E o terceiro escondia duas decisões numa:

    pessoa_cheia           → uma janela, alimentada pela pessoa
    quadro_com_moldura     → uma janela, alimentada pelo quadro
    tela_cima_pessoa_baixo → duas janelas, empilhadas
    pessoa_com_insert      → duas janelas, uma sobre a outra

Os dois primeiros não são layouts diferentes: são a MESMA montagem com fonte
diferente. Os dois últimos são a mesma montagem com disposição diferente.

## O que fica

**Modo** — a tela é CHEIA (uma janela) ou DIVIDIDA (duas). É o `full` /
`compartilhada` que o horizontal já usa, e que o operador já tem na cabeça.

**Disposição** — só existe em DIVIDIDA: empilhada ou insert.

**Fonte** — em CHEIA, qual região preenche a janela. É aqui que o enquadramento
deixa de ser um botão à parte: com uma janela só, *o recorte dela é o
enquadramento*.

**Combinação impossível não é oferecida.** Tela dividida num corte que só tem a
pessoa marcada não monta; antes ela aparecia na lista, o operador escolhia, o
palco caía no recorte simples e nada ligava uma coisa à outra. `catalogo()` diz
o que cada arranjo exige e por que ele não serve aqui.

A geometria dos slots não foi reinventada — sai dos mesmos números que os quatro
modelos já usavam e que o render já validou.

Sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.short.palco_short import CANVAS, Ajuste, ModeloPalco, Slot

# Fora da safe zone (18%) e fechando no meio do quadro: 352 = logo abaixo dela,
# 608 = 1080 em 16:9, e 352+608 = 960, o meio exato de 1920. São as mesmas
# âncoras dos modelos antigos — o render já as validou.
_TOPO_DA_TELA = 352
_ALTURA_DA_TELA = 608
_MEIO = CANVAS.altura // 2

# Margem lateral do insert, para ele ler como card sobreposto e não como uma
# segunda faixa colada na borda.
_MARGEM_DO_INSERT = 64


class ModoPalco(str, Enum):
    """Quantas janelas de vídeo a tela tem.

    CHEIA    — uma só, ocupando o quadro inteiro.
    DIVIDIDA — duas, para quando a tela compartilhada importa tanto quanto quem fala.
    """

    CHEIA = "cheia"
    DIVIDIDA = "dividida"


class Disposicao(str, Enum):
    """Como as duas janelas se acomodam. Só faz sentido em DIVIDIDA.

    EMPILHADA — tela em cima, pessoa embaixo, cada uma com metade do quadro.
    INSERT    — a pessoa domina e a tela entra como card sobre ela.
    """

    EMPILHADA = "empilhada"
    INSERT = "insert"


# Ordem de preferência para a janela CHEIA quando o operador não escolheu.
# A pessoa vem primeiro porque é ela que segura um short; o quadro é o último
# recurso, porque recortar o quadro inteiro traz junto o chrome da live.
_PREFERENCIA_DA_FONTE = ("pessoa", "quadro", "tela")

MODO_PADRAO = ModoPalco.CHEIA
DISPOSICAO_PADRAO = Disposicao.EMPILHADA


@dataclass(frozen=True)
class Arranjo:
    """Como esta tela é montada."""

    modo: ModoPalco = MODO_PADRAO
    disposicao: Disposicao = DISPOSICAO_PADRAO
    fonte: str = ""
    """Em CHEIA, a região que preenche a janela. Vazio deduz das disponíveis."""

    @property
    def chave(self) -> str:
        """Como o arranjo é gravado e trafega na API.

        Uma string só, e não dois campos: modo e disposição não são
        independentes — `disposicao` não significa nada em CHEIA, e dois campos
        deixariam gravar a combinação sem sentido.

        Exemplos:
            >>> Arranjo().chave
            'cheia'
            >>> Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.INSERT).chave
            'dividida_insert'
        """
        if self.modo is ModoPalco.CHEIA:
            return ModoPalco.CHEIA.value
        return f"{ModoPalco.DIVIDIDA.value}_{self.disposicao.value}"


def de_chave(chave: str, fonte: str = "") -> Arranjo:
    """O arranjo a partir da chave gravada. Desconhecida cai no padrão.

    Chave inválida não pode derrubar um render: um short antigo apontando para
    um arranjo que saiu do código deve sair montado, não deve sair com erro.

    Exemplos:
        >>> de_chave('dividida_empilhada').modo is ModoPalco.DIVIDIDA
        True
        >>> de_chave('cheia', fonte='tela').fonte
        'tela'
        >>> de_chave('nao-existe').chave
        'cheia'
    """
    bruto = (chave or "").strip().lower()
    if bruto == ModoPalco.CHEIA.value:
        return Arranjo(modo=ModoPalco.CHEIA, fonte=fonte)
    for disposicao in Disposicao:
        if bruto == f"{ModoPalco.DIVIDIDA.value}_{disposicao.value}":
            return Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=disposicao, fonte=fonte)
    return Arranjo(fonte=fonte)


def sugerir(regioes: dict) -> Arranjo:
    """O arranjo que as regiões disponíveis pedem.

    Duas regiões viram tela dividida; uma vira tela cheia alimentada por ela.
    Não é adivinhação: quem marcou tela E pessoa marcou porque as duas importam.

    Exemplos:
        >>> sugerir({'pessoa': {}, 'tela': {}}).chave
        'dividida_empilhada'
        >>> sugerir({'quadro': {}}).fonte
        'quadro'
        >>> sugerir({}).chave
        'cheia'
    """
    if "tela" in regioes and "pessoa" in regioes:
        return Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.EMPILHADA)
    return Arranjo(modo=ModoPalco.CHEIA, fonte=fonte_efetiva("", regioes))


def fonte_efetiva(escolhida: str, regioes: dict) -> str:
    """Qual região alimenta a janela CHEIA.

    A escolha do operador vence, desde que a região exista — apontar para uma
    região não marcada montaria uma janela vazia, e o short sairia preto sem
    nada dizer por quê.

    Exemplos:
        >>> fonte_efetiva('tela', {'pessoa': {}, 'tela': {}})
        'tela'
        >>> fonte_efetiva('tela', {'pessoa': {}})
        'pessoa'
        >>> fonte_efetiva('', {'quadro': {}, 'tela': {}})
        'quadro'
        >>> fonte_efetiva('', {})
        ''
    """
    if escolhida and escolhida in regioes:
        return escolhida
    for candidata in _PREFERENCIA_DA_FONTE:
        if candidata in regioes:
            return candidata
    return next(iter(regioes), "")


def slots_de(arranjo: Arranjo, regioes: dict) -> dict[str, Slot]:
    """Onde cada janela cai no quadro do short.

    Devolve `{}` quando o arranjo não tem como ser montado com estas regiões —
    DIVIDIDA sem as duas, ou CHEIA sem nenhuma. Vazio e não exceção: quem chama
    degrada para o recorte simples e diz na tela que faltou região.

    Exemplos:
        >>> sorted(slots_de(Arranjo(), {'pessoa': {}}))
        ['pessoa']
        >>> dividida = Arranjo(modo=ModoPalco.DIVIDIDA)
        >>> sorted(slots_de(dividida, {'pessoa': {}, 'tela': {}}))
        ['pessoa', 'tela']
        >>> slots_de(dividida, {'pessoa': {}})
        {}
    """
    if arranjo.modo is ModoPalco.CHEIA:
        fonte = fonte_efetiva(arranjo.fonte, regioes)
        if not fonte:
            return {}
        return {fonte: _janela_inteira()}

    if not ("tela" in regioes and "pessoa" in regioes):
        return {}
    if arranjo.disposicao is Disposicao.INSERT:
        return {
            "pessoa": _janela_inteira(),
            "tela": Slot(
                x=_MARGEM_DO_INSERT,
                y=400,
                w=CANVAS.largura - 2 * _MARGEM_DO_INSERT,
                h=536,
                ajuste=Ajuste.CABER,
            ),
        }
    return {
        "tela": Slot(
            x=0, y=_TOPO_DA_TELA, w=CANVAS.largura, h=_ALTURA_DA_TELA, ajuste=Ajuste.CABER
        ),
        "pessoa": Slot(x=0, y=_MEIO, w=CANVAS.largura, h=_MEIO, ajuste=Ajuste.COBRIR),
    }


def montar_modelo(arranjo: Arranjo, regioes: dict) -> ModeloPalco | None:
    """O arranjo resolvido em slots concretos, ou `None` quando não monta.

    Devolve um `ModeloPalco` porque é o que o resto do palco consome — mas ele
    agora nasce do par (modo, disposição) em vez de sair de um catálogo fixo de
    quatro. É a diferença entre escolher numa lista e descrever o que se quer.
    """
    slots = slots_de(arranjo, regioes)
    if not slots:
        return None
    descricao = next((i for i in catalogo() if i["chave"] == arranjo.chave), None)
    return ModeloPalco(
        id=arranjo.chave,
        nome=descricao["nome"] if descricao else arranjo.chave,
        porque=descricao["porque"] if descricao else "",
        slots=slots,
    )


def catalogo(regioes: dict | None = None) -> list[dict]:
    """Os arranjos, com o porquê de cada um e o que as regiões atuais permitem.

    `possivel`/`impedimento` existem para a tela não OFERECER o que não monta.
    Sem isso o operador combina livremente e descobre depois: escolhe tela
    dividida num corte que só tem a pessoa marcada, o palco cai no recorte
    simples, e nada na tela liga uma coisa à outra. Oferecer o impossível é o
    mesmo que mentir devagar.

    Sem `regioes`, tudo volta possível — é o catálogo cru, para quem só quer os
    nomes.
    """
    disponiveis = regioes if regioes is not None else None
    itens = [
        {
            "chave": Arranjo().chave,
            "modo": ModoPalco.CHEIA.value,
            "disposicao": "",
            "nome": "Tela cheia",
            "porque": (
                "Uma janela só, ocupando o short inteiro. É o caso do talking head — "
                "e o recorte dela é o próprio enquadramento."
            ),
            "janelas": 1,
        },
        {
            "chave": Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.EMPILHADA).chave,
            "modo": ModoPalco.DIVIDIDA.value,
            "disposicao": Disposicao.EMPILHADA.value,
            "nome": "Dividida: tela em cima, pessoa embaixo",
            "porque": (
                "As duas metades do quadro. Quem fala fica perto da legenda, que é "
                "onde o olho já está."
            ),
            "janelas": 2,
        },
        {
            "chave": Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.INSERT).chave,
            "modo": ModoPalco.DIVIDIDA.value,
            "disposicao": Disposicao.INSERT.value,
            "nome": "Dividida: pessoa grande, tela num insert",
            "porque": "Quando a tela ilustra mas não é o assunto.",
            "janelas": 2,
        },
    ]

    for item in itens:
        item["possivel"], item["impedimento"] = _viabilidade(item["chave"], disponiveis)
    return itens


def _viabilidade(chave: str, regioes: dict | None) -> tuple[bool, str]:
    if regioes is None:
        return True, ""
    if slots_de(de_chave(chave), regioes):
        return True, ""
    if chave == Arranjo().chave:
        return False, "nenhuma região marcada neste corte"
    faltam = [nome for nome in ("tela", "pessoa") if nome not in regioes]
    return False, f"falta marcar: {', '.join(faltam)}"


def _janela_inteira() -> Slot:
    return Slot(x=0, y=0, w=CANVAS.largura, h=CANVAS.altura, ajuste=Ajuste.COBRIR)

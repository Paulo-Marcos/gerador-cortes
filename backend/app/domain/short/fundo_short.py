"""O fundo do palco vertical — quais cores servem, e por quê (E-037, D-499).

O fundo aparece onde o conteúdo não preenche o slot: a faixa acima e abaixo da
tela compartilhada, a sobra em volta de um insert. Ele é o que o espectador vê
mais tempo depois do rosto, e até aqui era uma constante cravada no código
(`0x0f1410`) — o mesmo valor que a paleta do canal já guardava como `fundoPalco`.

Duas fontes para o mesmo número é o problema que `cor_do_tema` existe para
resolver: o canal trocaria a paleta e o short sairia com a cor antiga, sem nada
apontando o porquê. Aqui a paleta passa a mandar, e o operador escolhe DENTRO
dela.

## Por que só cores opacas

A paleta tem `rgba(...)` para cards e linhas, que existem para se sobrepor a algo.
O fundo não se sobrepõe a nada: é o que está atrás de tudo. Uma cor translúcida
ali revelaria o preto do encoder, e o resultado seria a cor certa lavada — o tipo
de defeito que se atribui ao filtro, nunca à escolha do fundo.

Sem I/O: a paleta chega de fora, lida do tema do canal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# #abc é a forma curta de #aabbcc.
_DIGITOS_DO_HEX_CURTO = 3

# `#rrggbb` ou `#rgb`. É o que o `color=` do ffmpeg aceita depois da conversão,
# e é o que "opaco" quer dizer numa paleta que também tem rgba().
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# A chave da paleta que o palco vertical usava cravada. Continua sendo o default
# — a mudança é de onde o valor vem, não de qual é.
CHAVE_PADRAO = "fundoPalco"

# Último recurso, para o caso de o `theme.config.json` sumir ou vir quebrado.
# Fundo ausente não pode derrubar um render.
FUNDO_PADRAO = "#0f1410"


@dataclass(frozen=True)
class FundoDoCanal:
    """Uma cor da paleta oferecível como fundo do short."""

    chave: str
    cor: str

    @property
    def ffmpeg(self) -> str:
        """A mesma cor no dialeto do `color=` do ffmpeg.

        Exemplo:
            >>> FundoDoCanal("fundoPalco", "#0f1410").ffmpeg
            '0x0f1410'
        """
        return para_ffmpeg(self.cor)


def fundos_disponiveis(paleta: dict) -> list[FundoDoCanal]:
    """As cores da paleta que servem de fundo, na ordem em que ela as declara.

    A ordem é a do arquivo de tema e não alfabética: quem escreveu a paleta pôs
    as cores estruturais primeiro, e reordenar aqui esconderia essa intenção.

    Exemplo:
        >>> [f.chave for f in fundos_disponiveis({
        ...     "fundoPalco": "#0f1410",
        ...     "verdeCard1": "rgba(44, 68, 56, 0.96)",
        ...     "marromQuente": "#3c2a22",
        ... })]
        ['fundoPalco', 'marromQuente']
    """
    return [
        FundoDoCanal(chave=chave, cor=valor)
        for chave, valor in (paleta or {}).items()
        if isinstance(valor, str) and _HEX.match(valor.strip())
    ]


def resolver(escolhido: str, paleta: dict) -> str:
    """A cor de fundo deste short, em hex.

    `escolhido` é a CHAVE da paleta que o operador marcou; vazio significa "o
    default do canal". Chave que não existe mais — porque a paleta mudou —
    também cai no default, em vez de derrubar o render por causa de um nome.

    Exemplos:
        >>> paleta = {"fundoPalco": "#0f1410", "marromQuente": "#3c2a22"}
        >>> resolver("marromQuente", paleta)
        '#3c2a22'
        >>> resolver("", paleta)
        '#0f1410'
        >>> resolver("cor-que-sumiu", paleta)
        '#0f1410'
        >>> resolver("", {})
        '#0f1410'
    """
    disponiveis = {f.chave: f.cor for f in fundos_disponiveis(paleta)}
    if escolhido and escolhido in disponiveis:
        return disponiveis[escolhido]
    return disponiveis.get(CHAVE_PADRAO, FUNDO_PADRAO)


def para_ffmpeg(cor: str) -> str:
    """`#rrggbb` → `0xrrggbb`, que é como o `color=` do ffmpeg lê.

    Expande a forma curta: `#abc` é `#aabbcc`, e o ffmpeg não faz essa conta.

    Exemplos:
        >>> para_ffmpeg("#0f1410")
        '0x0f1410'
        >>> para_ffmpeg("#abc")
        '0xaabbcc'
        >>> para_ffmpeg("nao é cor")
        '0x0f1410'
    """
    bruto = (cor or "").strip()
    if not _HEX.match(bruto):
        return para_ffmpeg(FUNDO_PADRAO)
    digitos = bruto[1:]
    if len(digitos) == _DIGITOS_DO_HEX_CURTO:
        digitos = "".join(d * 2 for d in digitos)
    return f"0x{digitos.lower()}"

"""O roteiro do upload assistido de Reels no instagram.com (D-564, onda 3).

## Por que o Instagram entrou pelo navegador, e não pela API

A API oficial existe e publica Reels — mas cobra um pedágio que este app não tem
como pagar hoje: conta Business ligada a uma Página, app review, e o vídeo
acessível por uma **URL pública**. O app roda na máquina do operador, com os MP4
em disco; servir cada corte por HTTP para o Facebook baixar seria montar
infraestrutura de hospedagem para publicar num perfil só.

O navegador não cobra nada disso. A sessão é a que ele já usa.

## Onde este roteiro para, e por quê

No botão *Compartilhar*, pelo mesmo motivo do TikTok (D-537): até ali tudo é
reversível fechando o modal; depois dali é um post público.

## O sinal de "publicou" é OUTRO, e isso muda o desenho

No TikTok a prova é a NAVEGAÇÃO: ao publicar, a aba sai de `/upload`. Aqui não
existe navegação — o Instagram cria o Reel dentro de um modal e a URL não muda.
Assumir a URL como sinal daria um falso positivo permanente.

A primeira versão disto apostou no modal FECHAR. Errado, e medido publicando de
verdade em 10/09/2026: ao compartilhar, o compositor não fecha — ele é
**substituído** por um diálogo de confirmação ("Reels compartilhados / Concluir /
Seu reel foi compartilhado."). Uma vigília esperando o modal sumir esperaria os
trinta minutos inteiros por um evento que nunca acontece, e terminaria devolvendo
"não sei" sobre um post que estava no ar.

Então a prova é a PRESENÇA da confirmação, e não a ausência do compositor. É um
sinal positivo, o que também resolve a ambiguidade do descarte: descartar fecha
tudo sem confirmar nada.
"""

from __future__ import annotations

import re
from enum import StrEnum


class Passo(StrEnum):
    """Os passos do roteiro, na ordem em que acontecem."""

    ABRIR = "abrir"
    SESSAO = "sessao"
    COMPOSITOR = "compositor"
    ARQUIVO = "arquivo"
    # D-592: a etapa "Cortar" abre em 1:1; sem este passo o 9:16 saía cortado.
    RECORTE = "recorte"
    AVANCAR = "avancar"
    # D-589: acontece DURANTE o avancar (mora na etapa "Editar"), e so e
    # registrado depois dele porque so ali se sabe se entrou.
    CAPA = "capa"
    LEGENDA = "legenda"
    REVISAO = "revisao"
    PUBLICAR = "publicar"


PASSOS: tuple[Passo, ...] = tuple(Passo)


ROTULOS: dict[Passo, str] = {
    Passo.ABRIR: "abrindo o Instagram",
    Passo.SESSAO: "conferindo a sessão",
    Passo.COMPOSITOR: "abrindo o compositor",
    Passo.ARQUIVO: "enviando o vídeo",
    Passo.RECORTE: "mantendo o vídeo inteiro no recorte",
    Passo.AVANCAR: "passando pelas etapas de edição",
    Passo.CAPA: "trocando a capa",
    Passo.LEGENDA: "escrevendo a legenda",
    Passo.REVISAO: "deixando pronto para você conferir",
    Passo.PUBLICAR: "compartilhando",
}


ORIENTACOES: dict[Passo, str] = {
    Passo.ABRIR: "Nao consegui abrir o Instagram. Confira se o Chrome abriu e se ha internet.",
    Passo.SESSAO: (
        "Este Chrome nao esta logado no Instagram. Faca login na janela que abriu — "
        "uma vez so, a sessao fica guardada — e rode de novo."
    ),
    Passo.COMPOSITOR: (
        "Nao achei o botao de criar publicacao. O Instagram muda esse menu com "
        "frequencia: suba este Reel a mao e me avise para eu ajustar."
    ),
    Passo.ARQUIVO: (
        "O compositor nao aceitou o arquivo. Ele pode ter mudado de layout: "
        "suba este video a mao e me avise para eu ajustar."
    ),
    Passo.RECORTE: (
        "Nao consegui manter o video inteiro: o Instagram abre o recorte em quadrado. "
        "No modal que ficou aberto, clique no icone de recorte (canto inferior "
        "esquerdo), escolha Original e siga a mao."
    ),
    Passo.AVANCAR: (
        "Travei numa das etapas de edicao (cortar, filtros). O modal ficou aberto — "
        "siga a mao a partir dali."
    ),
    Passo.CAPA: (
        "Subi o video, mas nao consegui trocar a capa. Ela esta na pasta do pacote: "
        "volte pela seta ate a etapa Editar e troque antes de compartilhar."
    ),
    Passo.LEGENDA: (
        "Nao achei a caixa da legenda. Ela esta na area de transferencia: cole com "
        "Ctrl+V no modal que ficou aberto."
    ),
    Passo.REVISAO: (
        "O botao de compartilhar nao acendeu. Pode ser processamento ainda em curso "
        "ou um aviso do proprio Instagram: confira no modal que ficou aberto."
    ),
    Passo.PUBLICAR: (
        "Cliquei em Compartilhar e o compositor nao fechou. Confira no modal que "
        "ficou aberto: pode ter aparecido um aviso do proprio Instagram."
    ),
}


# Só a capa é opcional (D-589), pelo mesmo motivo do TikTok: quando ela entra, o
# vídeo já subiu, e derrubar o Reel por causa dela trocaria um contratempo por um
# retrabalho. Os demais continuam obrigatórios: se um quebra, não há post.
PASSOS_OPCIONAIS: frozenset[Passo] = frozenset({Passo.CAPA})


class RoteiroInterrompido(RuntimeError):
    """Um passo falhou, e a mensagem já diz o que fazer.

    Classe própria (e não a do TikTok) porque os passos são outros: um `except`
    que pegasse as duas trataria "nao achei o compositor" e "a sessao caiu" como
    o mesmo problema.
    """

    def __init__(self, passo: Passo, detalhe: str = "") -> None:
        self.passo = passo
        self.detalhe = detalhe
        super().__init__(orientacao_da_falha(passo, detalhe))


def orientacao_da_falha(passo: Passo, detalhe: str = "") -> str:
    """O que o operador faz agora, em uma frase.

    >>> orientacao_da_falha(Passo.SESSAO)[:24]
    'Este Chrome nao esta log'
    >>> orientacao_da_falha(Passo.LEGENDA, "timeout de 30s").endswith("(timeout de 30s)")
    True
    """
    base = ORIENTACOES.get(passo, f"Falhou {ROTULOS.get(passo, passo.value)}.")
    return f"{base} ({detalhe})" if detalhe else base


def descricao_do_progresso(feitos: list[Passo]) -> str:
    """O que o robô conseguiu fazer, para a tela contar sem inventar.

    >>> descricao_do_progresso([])
    'nada foi feito'
    >>> descricao_do_progresso([Passo.ARQUIVO])
    'enviando o vídeo'
    >>> descricao_do_progresso([Passo.ARQUIVO, Passo.LEGENDA])
    'enviando o vídeo e escrevendo a legenda'
    """
    rotulos = [ROTULOS[p] for p in feitos if p in ROTULOS]
    if not rotulos:
        return "nada foi feito"
    if len(rotulos) == 1:
        return rotulos[0]
    return f"{', '.join(rotulos[:-1])} e {rotulos[-1]}"


# As telas de porta de entrada do Instagram. `emailsignup` esta na lista porque
# ele manda para la sozinho quem chega deslogado e clica em qualquer coisa — e
# ela NAO casa com "/accounts/signup", que era o teste anterior.
TELAS_DE_ENTRADA = ("/accounts/login", "/accounts/signup", "/accounts/emailsignup")


def pede_login(url: str) -> bool:
    """A URL indica que o Instagram jogou a sessão para a porta de entrada.

    **Cuidado: `False` aqui NÃO prova que há sessão.** Medido na página real em
    10/09/2026: deslogado, o Instagram serve o formulário de login em `/` mesmo,
    sem redirecionar — ao contrário do TikTok, que redireciona sempre.

    Por isso quem decide de verdade é a TELA, e não a URL: ver
    `marca_de_login` no roteiro. Esta função continua valendo para o caso
    explícito, que é barato de checar e evita ir mais longe à toa.

    >>> pede_login("https://www.instagram.com/accounts/login/?next=%2F")
    True
    >>> pede_login("https://www.instagram.com/accounts/emailsignup/")
    True
    >>> pede_login("https://www.instagram.com/")
    False
    >>> pede_login("")
    False
    """
    return any(tela in url for tela in TELAS_DE_ENTRADA)


def publicou(confirmacao_visivel: bool) -> bool:
    """O Reel saiu?

    Um argumento só, e ele é um sinal POSITIVO: o diálogo de confirmação está na
    tela. Medido publicando de verdade em 10/09/2026 — ver o cabeçalho do módulo
    para por que a versão anterior, que olhava o compositor fechar, estava errada.

    Positivo importa porque descartar e publicar terminam parecidos: os dois
    tiram o compositor da frente. Só um dos dois confirma. E na dúvida a resposta
    é `False`, que significa "não sei" e mantém o botão "publiquei" à mão —
    marcar no escuro libera a limpeza do MP4 (D-512), e a volta é render novo.

    >>> publicou(confirmacao_visivel=True)
    True
    >>> publicou(confirmacao_visivel=False)
    False
    """
    return confirmacao_visivel


def recorte_vertical(estilo: str) -> bool:
    r"""A janela de recorte do compositor está mais alta que larga? (D-592)

    Lê o `style` inline da janela, onde o Instagram escreve o tamanho que o
    recorte usa — MEDIDO em 13/09/2026: 510x510 em 1:1, 287x510 em Original.

    A âncora `(?<![\w-])` existe porque `max-width` e `border-width` também
    terminam em "width", e casar com eles mediria a coisa errada.

    >>> recorte_vertical("height: 510px; width: 287px; display: flex")
    True
    >>> recorte_vertical("height: 510px; width: 510px;")
    False
    >>> recorte_vertical("max-width: 100px; height: 510px; width: 510px")
    False
    >>> recorte_vertical("")
    False
    """
    largura = _medida_em_px(estilo, "width")
    altura = _medida_em_px(estilo, "height")
    return largura is not None and altura is not None and largura < altura


def _medida_em_px(estilo: str, propriedade: str) -> float | None:
    achado = re.search(rf"(?<![\w-]){propriedade}\s*:\s*([\d.]+)px", estilo)
    return float(achado.group(1)) if achado else None

"""O roteiro do upload assistido no TikTok Studio (D-537).

## Por que existe um módulo puro para "clicar numa página"

Porque a parte que quebra não é o clique — é o CONTRATO com uma tela que não é
nossa. O TikTok redesenha o Studio quando quer, e no dia em que redesenhar, o
que decide se isto é um contratempo de dois minutos ou uma tarde de arqueologia
é uma coisa só: a falha saber dizer QUAL passo quebrou e o que fazer a respeito.

Então o roteiro — os passos, os rótulos e a orientação de cada falha — mora
aqui, longe do Playwright, e é testável sem navegador nenhum. O serviço vira o
braço que executa; este módulo é a cabeça que sabe o que está tentando fazer.

## Onde ele para, e por quê

No penúltimo passo. O robô sobe o arquivo, escreve a legenda, põe a capa,
espera o processamento — e entrega a aba pronta com o botão *Publicar* aceso,
sem tocar nele.

Não é timidez: é onde o custo do erro muda de natureza. Até ali, tudo é
reversível com um F5. Depois dali, uma legenda errada é um post público no canal
dele. O humano fica no passo irreversível porque é o único em que ele é
insubstituível — nos outros quatro ele só estava sendo repetitivo.
"""

from __future__ import annotations

from enum import StrEnum


class Passo(StrEnum):
    """Os passos do roteiro, na ordem em que acontecem."""

    ABRIR = "abrir"
    SESSAO = "sessao"
    ARQUIVO = "arquivo"
    PROCESSAMENTO = "processamento"
    LEGENDA = "legenda"
    CAPA = "capa"
    REVISAO = "revisao"


PASSOS: tuple[Passo, ...] = tuple(Passo)


ROTULOS: dict[Passo, str] = {
    Passo.ABRIR: "abrindo o TikTok Studio",
    Passo.SESSAO: "conferindo a sessão",
    Passo.ARQUIVO: "enviando o vídeo",
    Passo.PROCESSAMENTO: "esperando o TikTok processar",
    Passo.LEGENDA: "escrevendo a legenda",
    Passo.CAPA: "trocando a capa",
    Passo.REVISAO: "deixando pronto para você conferir",
}


# A capa é o único passo cuja falha NÃO cancela o upload: o vídeo já subiu e a
# legenda já está escrita, e o TikTok congela um frame qualquer quando ninguém
# escolhe. Perder o pacote inteiro por causa do passo mais decorativo seria
# trocar um contratempo por um retrabalho.
PASSOS_OPCIONAIS: frozenset[Passo] = frozenset({Passo.CAPA})


ORIENTACOES: dict[Passo, str] = {
    Passo.ABRIR: (
        "Nao consegui abrir o TikTok Studio. Confira se o Chrome abriu e se ha internet."
    ),
    Passo.SESSAO: (
        "Este Chrome nao esta logado no TikTok. Faca login na janela que abriu — "
        "uma vez so, a sessao fica guardada — e rode de novo."
    ),
    Passo.ARQUIVO: (
        "A pagina de upload nao aceitou o arquivo. Ela pode ter mudado de layout: "
        "suba este video a mao e me avise para eu ajustar."
    ),
    Passo.PROCESSAMENTO: (
        "O TikTok nao terminou de processar o video no tempo esperado. A aba ficou "
        "aberta — confira por la; se ele terminar, e so seguir a mao."
    ),
    Passo.LEGENDA: (
        "Nao achei a caixa da legenda. Ela esta na area de transferencia: cole com "
        "Ctrl+V na aba que ficou aberta."
    ),
    Passo.CAPA: (
        "Subi o video e escrevi a legenda, mas nao consegui trocar a capa. Ela esta "
        "na pasta do pacote — poe a mao antes de publicar."
    ),
    Passo.REVISAO: (
        "O botao de publicar nao acendeu. Pode ser processamento ainda em curso ou "
        "um aviso da propria pagina: confira na aba que ficou aberta."
    ),
}


class RoteiroInterrompido(RuntimeError):
    """Um passo do roteiro falhou, e a mensagem já diz o que fazer.

    Carrega o passo porque a tela precisa distinguir "faca login" de "a pagina
    mudou" — as duas sao a mesma excecao para o Python e problemas
    completamente diferentes para quem esta às onze da noite tentando publicar.
    """

    def __init__(self, passo: Passo, detalhe: str = "") -> None:
        self.passo = passo
        self.detalhe = detalhe
        super().__init__(orientacao_da_falha(passo, detalhe))


def orientacao_da_falha(passo: Passo, detalhe: str = "") -> str:
    """O que o operador faz agora, em uma frase.

    O detalhe técnico entra entre parênteses e no fim: quem lê primeiro precisa
    da ação, não do seletor que não casou.

    >>> orientacao_da_falha(Passo.SESSAO)[:24]
    'Este Chrome nao esta log'
    >>> orientacao_da_falha(Passo.CAPA, "timeout de 15s").endswith("(timeout de 15s)")
    True
    """
    base = ORIENTACOES.get(passo, f"Falhou {ROTULOS.get(passo, passo.value)}.")
    return f"{base} ({detalhe})" if detalhe else base


def descricao_do_progresso(feitos: list[Passo]) -> str:
    """O que o robô conseguiu fazer, para a tela contar sem inventar.

    Só os passos que REALMENTE rodaram entram. A tentação aqui é devolver uma
    frase bonita e fixa ("tudo pronto!") — e aí o dia em que a capa falhar ele
    publica sem capa achando que ela foi.

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


def publicou(url: str) -> bool:
    """A aba saiu da página de upload — o único sinal forte de publicação.

    Ele existe porque a alternativa é pior de um jeito caro. Marcar um corte
    como publicado no TikTok LIBERA a limpeza automática do
    `upload_ready/video.mp4` (D-512): um falso positivo apaga o arquivo, e a
    volta é render novo. Errar para menos custa um clique no "publiquei";
    errar para mais custa o material.

    Por isso não olhamos toasts nem textos de sucesso, que aparecem em várias
    situações e mudam de redação. Olhamos a NAVEGAÇÃO: ao publicar, o TikTok
    leva a aba para a lista de publicações. Descartar, não — ele reseta a
    própria página de upload, e a aba continua onde estava. É essa assimetria
    que separa os dois eventos sem ambiguidade.

    >>> publicou("https://www.tiktok.com/tiktokstudio/content")
    True
    >>> publicou("https://www.tiktok.com/tiktokstudio/upload?from=upload")
    False
    >>> publicou("https://www.tiktok.com/login")
    False
    >>> publicou("")
    False
    """
    if not url or "tiktok.com" not in url:
        return False
    if pede_login(url):
        return False
    return "/tiktokstudio" in url and "/upload" not in url


def pede_login(url: str) -> bool:
    """A URL indica que o TikTok jogou a sessão para a tela de login.

    Ele não devolve 401: redireciona. Sem esta checagem o roteiro seguiria
    procurando o campo de arquivo numa tela de login e reportaria "a pagina
    mudou de layout" — mandando o operador investigar um problema que não
    existe, em vez de simplesmente entrar na conta.

    >>> pede_login("https://www.tiktok.com/login?redirect_url=%2Fupload")
    True
    >>> pede_login("https://www.tiktok.com/tiktokstudio/upload?from=upload")
    False
    """
    return "/login" in url or "/signup" in url

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

import re
from dataclasses import dataclass
from enum import StrEnum


class Passo(StrEnum):
    """Os passos do roteiro, na ordem em que acontecem."""

    ABRIR = "abrir"
    SESSAO = "sessao"
    ARQUIVO = "arquivo"
    PROCESSAMENTO = "processamento"
    LEGENDA = "legenda"
    CAPA = "capa"
    # D-580: so acontece quando o operador escolhe dia e hora. Sem data, o
    # roteiro pula daqui direto para a revisao, como sempre fez.
    AGENDAMENTO = "agendamento"
    REVISAO = "revisao"
    # D-564: so acontece quando o operador LIGA o publicar automatico. Fora
    # disso o roteiro termina em REVISAO, como sempre terminou.
    PUBLICAR = "publicar"


PASSOS: tuple[Passo, ...] = tuple(Passo)


ROTULOS: dict[Passo, str] = {
    Passo.ABRIR: "abrindo o TikTok Studio",
    Passo.SESSAO: "conferindo a sessão",
    Passo.ARQUIVO: "enviando o vídeo",
    Passo.PROCESSAMENTO: "esperando o TikTok processar",
    Passo.LEGENDA: "escrevendo a legenda",
    Passo.CAPA: "trocando a capa",
    Passo.AGENDAMENTO: "marcando dia e hora",
    Passo.REVISAO: "deixando pronto para você conferir",
    Passo.PUBLICAR: "publicando",
}


# O agendamento NÃO entra nos opcionais, e a diferença com a capa é exatamente o
# que ela ensina: capa que falha custa uma imagem feia, agendamento que falha
# custa um post no ar na hora errada. Quando o operador pede 14h de quinta, o
# silêncio não é uma degradação aceitável — é publicar agora sem avisar.
#
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
    Passo.AGENDAMENTO: (
        "Nao consegui marcar o dia e a hora no TikTok. O video subiu e a legenda "
        "esta escrita: marque o agendamento a mao na aba que ficou aberta, ANTES "
        "de publicar — senao ele vai ao ar agora."
    ),
    Passo.REVISAO: (
        "O botao de publicar nao acendeu. Pode ser processamento ainda em curso ou "
        "um aviso da propria pagina: confira na aba que ficou aberta."
    ),
    Passo.PUBLICAR: (
        "Cliquei em Publicar e a pagina nao saiu do upload. Confira na aba que ficou "
        "aberta: pode ter aparecido um aviso da propria plataforma."
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


# D-564: o prefixo da marca que identifica UMA aba do lote.
#
# `window.name` é a única propriedade de uma aba que SOBREVIVE à navegação dela
# — é para isso que ela existe. Isso é exatamente o que a vigília precisa: ela
# procura a aba antes de o TikTok publicar (ainda em `/upload`) e confirma
# depois (já na lista de publicações), e é a MESMA aba nos dois instantes.
PREFIXO_DA_MARCA = "cortadorlive-"


def marca_da_aba(identificador: str) -> str:
    """A etiqueta que o roteiro cola na aba, para a vigília reencontrá-la.

    Sem ela a vigília procurava "alguma aba em /upload" (D-546) — o que basta
    quando há um upload por vez e vira loteria num lote: duas abas de upload
    abertas e ela não sabe qual é qual. Marcar o vídeo errado como publicado
    libera a limpeza do MP4 (D-512), e a volta é render novo.

    >>> marca_da_aba("abc123")
    'cortadorlive-abc123'
    >>> marca_da_aba("")
    ''
    """
    identificador = identificador.strip()
    return f"{PREFIXO_DA_MARCA}{identificador}" if identificador else ""


def e_a_aba_marcada(nome_da_janela: str, marca: str) -> bool:
    """Esta aba é a que o roteiro marcou?

    Sem marca, qualquer aba serve — é o comportamento de antes da D-564, que o
    botão avulso do TikTok ainda usa.

    >>> e_a_aba_marcada("cortadorlive-abc", "cortadorlive-abc")
    True
    >>> e_a_aba_marcada("", "cortadorlive-abc")
    False
    >>> e_a_aba_marcada("qualquer coisa", "")
    True
    """
    return True if not marca else nome_da_janela == marca


# D-564: a porta de depuração é DO PERFIL, e não uma porta global.
#
# A porta fixa 9222 foi o que permitiu o acidente: o backend de DEV encontrou um
# Chrome vivo naquela porta, concluiu "já tem um aberto" e conectou — só que o
# Chrome era o de PRODUÇÃO, com a conta real logada. Ninguém programou isso; a
# porta era um nome global, e nome global casa com quem chegar primeiro.
#
# É a mesma lição da D-370, quando o launcher matava processos por porta e
# derrubava PROD junto: identidade de processo se ancora no CAMINHO ABSOLUTO,
# nunca num token que dois checkouts compartilham.
#
# Cem portas bastam — é um operador com um punhado de canais, não um datacenter.
PORTA_MINIMA_DE_DEPURACAO = 9222
PORTAS_DE_DEPURACAO = 100


def porta_de_depuracao(perfil: str) -> int:
    """Uma porta estável e exclusiva para cada perfil de navegador.

    Estável porque precisa reencontrar o Chrome já aberto entre um item do lote
    e o seguinte; exclusiva porque dois checkouts NÃO podem se encontrar.

    O caminho entra em minúsculas: no Windows `C:/PRD` e `c:/prd` são a mesma
    pasta, e derivar portas diferentes para elas faria o mesmo perfil abrir dois
    Chromes — que é justamente o que o Chrome não permite.

    >>> porta_de_depuracao("C:/PRD/instance/channels/default/browser/tiktok") == porta_de_depuracao(
    ...     "c:/prd/instance/channels/default/browser/tiktok"
    ... )
    True
    >>> porta_de_depuracao("C:/DEV/a") == porta_de_depuracao("C:/DEV/b")
    False
    >>> PORTA_MINIMA_DE_DEPURACAO <= porta_de_depuracao("qualquer") < 9322
    True
    >>> porta_de_depuracao("")
    9222
    """
    import hashlib

    if not perfil:
        return PORTA_MINIMA_DE_DEPURACAO
    digest = hashlib.sha1(perfil.casefold().encode("utf-8")).digest()
    return PORTA_MINIMA_DE_DEPURACAO + int.from_bytes(digest[:4], "big") % PORTAS_DE_DEPURACAO


ARGUMENTO_DO_PERFIL = "--user-data-dir="


def perfil_na_linha_de_comando(argumentos: list[str]) -> str:
    """O `--user-data-dir` de uma linha de comando do Chrome, ou vazio.

    É com isto que se pergunta "esta janela é MINHA?" antes de mandar nela — a
    pergunta que faltava quando o robô de DEV dirigiu o Chrome de PROD.

    >>> perfil_na_linha_de_comando(["chrome.exe", "--user-data-dir=C:/a/b", "--no-first-run"])
    'C:/a/b'
    >>> perfil_na_linha_de_comando(["chrome.exe", "--user-data-dir", "C:/a/b"])
    'C:/a/b'
    >>> perfil_na_linha_de_comando(["chrome.exe"])
    ''
    """
    for indice, argumento in enumerate(argumentos):
        if argumento.startswith(ARGUMENTO_DO_PERFIL):
            return argumento[len(ARGUMENTO_DO_PERFIL) :]
        # O Chrome aceita as duas formas, e quem lança nem sempre é a gente.
        if argumento == ARGUMENTO_DO_PERFIL.rstrip("=") and indice + 1 < len(argumentos):
            return argumentos[indice + 1]
    return ""


def mesma_pasta(um: str, outro: str) -> bool:
    r"""Dois caminhos apontam para a mesma pasta?

    Normaliza o que o Windows considera irrelevante e o `==` nao: barra
    invertida contra barra normal, caixa, e a barra final. Sem isso, o mesmo
    perfil escrito de dois jeitos pareceria dois perfis — e o robo abriria um
    segundo Chrome sobre um perfil ja aberto, coisa que o Chrome recusa.

    O caso com barra invertida vive no teste, onde a string nao precisa
    sobreviver a um docstring: `mesma_pasta` normaliza os dois sentidos.

    >>> mesma_pasta("C:/a/b", "C:/A/B/")
    True
    >>> mesma_pasta("C:/a/b", "C:/a/c")
    False
    >>> mesma_pasta("", "C:/a/b")
    False
    """
    if not um or not outro:
        return False
    return _normalizar(um) == _normalizar(outro)


def _normalizar(caminho: str) -> str:
    return caminho.replace("\\", "/").rstrip("/").casefold()


# O cartao de status durante o envio, MEDIDO em 14/09/2026 com um short de 68 MB:
#
#     short.mp4 / 1080P / 5.34MB/68.3MB / Duração: 0m40s / Faltam 39 segundos /
#     Cancelar / 7.82%
#
# O percentual vem com DUAS casas e e a ultima linha; ao terminar, o cartao troca
# tudo por "Enviado（68.3MB）" — sem numero nenhum com %.
_PERCENTUAL = re.compile(r"(\d{1,3}(?:[.,]\d+)?)\s*%")
_TAMANHO_ENVIADO = re.compile(
    r"\d+(?:[.,]\d+)?\s*[KMGT]?B\s*/\s*\d+(?:[.,]\d+)?\s*[KMGT]?B", re.IGNORECASE
)
_TEMPO_RESTANTE = re.compile(
    r"^\s*(faltam?\b.*|.*\b(?:left|remaining)\b.*)$", re.IGNORECASE | re.MULTILINE
)

# De quanto em quanto o log do envio fala. A pagina atualiza a cada segundo;
# repetir isso no console enterraria as etapas que o operador quer ver.
PASSO_DO_LOG_DO_ENVIO = 10


@dataclass(frozen=True)
class LeituraDoEnvio:
    """O que o cartao de status diz sobre o envio, num instante."""

    percentual: float
    enviado: str = ""
    restante: str = ""

    @property
    def detalhe(self) -> str:
        return ", ".join(parte for parte in (self.enviado, self.restante) if parte)


def leitura_do_envio(texto: str) -> LeituraDoEnvio | None:
    """Le o cartao de status, ou `None` quando ele nao mostra percentual.

    `None` e resposta, nao erro: o cartao passa um instante sem numero antes de
    comecar, e fica sem numero de novo ao terminar.

    >>> leitura_do_envio("a.mp4\\n1080P\\n5.34MB/68.3MB\\nFaltam 39 segundos\\nCancelar\\n7.82%")
    LeituraDoEnvio(percentual=7.82, enviado='5.34MB/68.3MB', restante='faltam 39 segundos')
    >>> leitura_do_envio("a.mp4\\n1080P\\nEnviado（68.3MB）\\nSubstituir") is None
    True
    """
    achados = _PERCENTUAL.findall(texto or "")
    if not achados:
        return None
    tamanho = _TAMANHO_ENVIADO.search(texto)
    restante = _TEMPO_RESTANTE.search(texto)
    return LeituraDoEnvio(
        percentual=min(float(achados[-1].replace(",", ".")), 100.0),
        enviado=re.sub(r"\s+", "", tamanho.group(0)) if tamanho else "",
        restante=restante.group(1).strip().lower() if restante else "",
    )


def marco_do_envio(
    percentual: float, ultimo_marco: int, passo: int = PASSO_DO_LOG_DO_ENVIO
) -> int | None:
    """O marco que este percentual cruzou, se for novo.

    >>> marco_do_envio(7.82, 0) is None
    True
    >>> marco_do_envio(14.41, 0)
    10
    >>> marco_do_envio(18.8, 10) is None
    True
    >>> marco_do_envio(41.15, 10)
    40
    """
    marco = int(percentual // passo) * passo
    return marco if marco > ultimo_marco else None

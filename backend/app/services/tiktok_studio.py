"""Upload assistido no TikTok Studio, por automação de navegador (D-537).

## O que este módulo é, em uma frase

O braço que executa o roteiro de `domain/tiktok_studio.py`: abre o Chrome do
operador, sobe o MP4, escreve a legenda, troca a capa — e para com a aba pronta
e o botão *Publicar* aceso, sem tocar nele.

## Por que o Chrome DELE, e por CDP

Duas alternativas foram descartadas, e as duas por motivos práticos.

Um navegador do Playwright, com perfil próprio, exigiria login. Login é o único
lugar deste app onde uma senha apareceria, e senha é exatamente o que a gente
não quer perto de automação — nem no código, nem no disco, nem na memória.

Um `launch_persistent_context` resolveria o login (perfil guardado) mas não a
saída: quando o Playwright para, ele mata o contexto que criou — e a aba que o
operador precisa revisar fecha na cara dele.

Conectar por CDP resolve os dois. O Chrome é um processo INDEPENDENTE, iniciado
com um perfil dedicado (`instance/channels/<canal>/browser/tiktok`); o operador
loga ali uma vez, à mão, e a sessão fica. Nós conectamos, fazemos o trabalho e
desconectamos — e o Chrome continua vivo, com a aba pronta. De quebra é um
Chrome de verdade, que é o que o TikTok espera ver.

## A costura que permite testar isto

Um roteiro de automação sem teste é um roteiro que só falha em produção. Mas
testar Playwright de verdade exigiria um navegador e uma conta do TikTok — nada
disso cabe num `pytest`.

Então o roteiro (`executar_roteiro`) não fala com o Playwright: fala com um
`Pagina`, que tem sete verbos e nenhum seletor. O `PaginaDoPlaywright` é a
implementação real; nos testes entra um dublê. E os seletores ficam todos em
`SELETORES`, num lugar só — quando o TikTok redesenhar, o conserto é uma linha,
e a falha já disse qual.

## O que este módulo deliberadamente NÃO faz

Não digita senha, não cria conta, não resolve captcha. Se o TikTok pedir
verificação, o roteiro para e entrega a janela aberta — a intervenção humana ali
não é um contratempo, é o desenho.

E não clica em *Publicar*. Ver o docstring do módulo de domínio.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Protocol

from app.channel_paths import active_channel_root
from app.domain.tiktok_studio import (
    Passo,
    RoteiroInterrompido,
    descricao_do_progresso,
)

logger = logging.getLogger(__name__)

URL_DO_UPLOAD = "https://www.tiktok.com/tiktokstudio/upload?from=upload"

# Porta do protocolo de depuração do Chrome. Fixa e alta de propósito: o
# operador roda um canal por vez, e uma porta previsível é o que permite
# reaproveitar a janela já aberta em vez de abrir uma nova a cada corte.
PORTA_DE_DEPURACAO = 9222

# Quanto esperamos em cada passo. O processamento é o único generoso: um corte
# horizontal de meia hora leva minutos, e desistir no meio deixaria o operador
# com um upload órfão que ele nem sabe que existe.
SEGUNDOS_PARA_ABRIR = 45.0
SEGUNDOS_PARA_SESSAO = 20.0
SEGUNDOS_PARA_ELEMENTO = 30.0
SEGUNDOS_PARA_CAPA = 20.0
SEGUNDOS_PARA_TUTORIAL = 8.0
SEGUNDOS_PARA_PROCESSAR = 900.0


# Os seletores, num lugar só, MEDIDOS na página real em 06/09/2026 e não
# adivinhados. Quando o TikTok redesenhar o Studio, o conserto mora aqui — e a
# mensagem de falha já vai ter dito qual chave não casou.
#
# A preferência é por `data-e2e`: são os ganchos de teste do próprio TikTok, e
# sobrevivem a troca de idioma e a rearranjo de CSS. Onde não há, ancoramos no
# container que TEM um, para não pescar no documento inteiro.
#
# Três palpites meus morreram aqui, e vale registrar quais:
#
# 1. A capa não é um `<button>`. É uma `div.edit-container` dentro de
#    `[data-e2e=cover_container]` — nenhum seletor de botão a encontrava.
# 2. O modal confirma com "Salvar", não "Confirmar". E "Salvar" casaria por
#    substring com "Salvar rascunho", que está na MESMA página: um
#    `has-text("Salvar")` solto salvaria um rascunho em vez de aplicar a capa.
#    Daí a âncora no diálogo e na classe `header-button`.
# 3. O `<input type=file>` do vídeo é invisível por CSS, e some do DOM depois do
#    upload — o da capa, que nasce no lugar dele, aceita só imagem. Por isso os
#    dois filtram por `accept`, e não por posição.
SELETORES: dict[str, str] = {
    # As duas chaves de ARQUIVO tem de ser CSS puro: quem as resolve e o
    # `querySelector` do navegador, via CDP (D-544), e nao o Playwright — nada
    # de `:has-text` aqui.
    "campo_do_arquivo": 'input[type="file"][accept*="video"]',
    "tutorial": (
        '.react-joyride__tooltip button:has-text("Entendi"), '
        '.react-joyride__tooltip button:has-text("Got it")'
    ),
    "overlay_do_tutorial": "#react-joyride-portal",
    "editor_da_legenda": '[data-e2e="caption_container"] div[contenteditable="true"]',
    "status_do_upload": '[data-e2e="upload_status_container"]',
    "botao_da_capa": '[data-e2e="cover_container"] .edit-container',
    # D-545: a impressão digital do que está na capa hoje. É um blob, e blob
    # novo significa imagem nova — o que distingue "salvei" de "achei que
    # salvei". O TikTok SEMPRE mostra alguma capa (um quadro do vídeo), então
    # "existe capa" não prova nada; o que prova é ela ter mudado.
    "miniatura_da_capa": '[data-e2e="cover_container"] img',
    "dialogo": '[role="dialog"]',
    "campo_da_capa": 'input[type="file"][accept*="image"]',
    "confirmar_capa": (
        '[role="dialog"] button.header-button:has-text("Salvar"), '
        '[role="dialog"] button.header-button:has-text("Save")'
    ),
    "botao_publicar": '[data-e2e="post_video_button"]',
}

# O texto que o cartão de status mostra quando o arquivo terminou de subir.
# Esperar por ELE, e não só pelo botão de publicar acender, é o que impede
# devolver a aba no meio do upload de um corte de 300 MB.
ENVIO_CONCLUIDO = r"enviad|carregad|uploaded"


class Pagina(Protocol):
    """Os sete verbos de que o roteiro precisa — e nenhum seletor.

    O roteiro fala em chaves de `SELETORES` ("campo_do_arquivo"), não em CSS.
    Isso é o que mantém o roteiro legível como uma sequência de intenções e o
    torna testável com um dublê de vinte linhas.
    """

    def abrir(self, url: str, *, segundos: float) -> None: ...
    def url_atual(self) -> str: ...
    def enviar_arquivo(self, alvo: str, caminho: Path, *, segundos: float) -> None: ...
    def escrever(self, alvo: str, texto: str, *, segundos: float) -> None: ...
    def clicar(self, alvo: str, *, segundos: float) -> None: ...
    def existe(self, alvo: str, *, segundos: float, visivel: bool = True) -> bool: ...
    def esperar_texto(self, alvo: str, padrao: str, *, segundos: float) -> None: ...
    def esperar_habilitado(self, alvo: str, *, segundos: float) -> None: ...
    def remover(self, alvo: str) -> None: ...
    def texto_de(self, alvo: str) -> str: ...
    def atributo_de(self, alvo: str, atributo: str) -> str: ...
    def esperar_sumir(self, alvo: str, *, segundos: float) -> None: ...


def executar_roteiro(
    pagina: Pagina,
    *,
    video: Path,
    legenda: str,
    capa: Path | None,
) -> dict:
    """O roteiro, do jeito que um humano faria — e parando onde ele decide.

    A ordem não é a óbvia. A legenda e a capa entram ANTES de esperar o
    processamento, porque é isso que uma pessoa faz: enquanto a barra sobe, ela
    escreve. Esperar primeiro seria somar os dois tempos por nada.

    Devolve o relatório do que foi feito. Levanta `RoteiroInterrompido` no
    primeiro passo obrigatório que falhar — com a janela SEMPRE aberta, porque
    quem chama nunca fecha o navegador.
    """
    feitos: list[Passo] = []
    avisos: list[str] = []

    _passo(pagina.abrir, Passo.ABRIR, URL_DO_UPLOAD, segundos=SEGUNDOS_PARA_ABRIR)
    feitos.append(Passo.ABRIR)

    from app.domain.tiktok_studio import pede_login

    if pede_login(pagina.url_atual()):
        raise RoteiroInterrompido(Passo.SESSAO)

    # O redirecionamento para o login é do CLIENTE, e chega DEPOIS do `goto`
    # retornar. Olhar a URL só naquele instante pega a antiga: o roteiro segue
    # achando que está logado, gasta o timeout inteiro procurando o campo de
    # arquivo numa tela de login e então reporta "a página mudou de layout" —
    # exatamente o diagnóstico errado que este passo existe para evitar.
    #
    # Aconteceu no primeiro teste de fumaça, e o teste existe por isso. Agora
    # esperamos uma DECISÃO: ou o campo de upload aparece, ou a URL vira login.
    #
    # `visivel=False` porque o campo é um <input type=file> escondido por CSS —
    # a "área de arrastar" é a fachada dele. Esperar por visibilidade aqui
    # daria falso negativo em toda página de upload legítima.
    if not pagina.existe("campo_do_arquivo", segundos=SEGUNDOS_PARA_SESSAO, visivel=False):
        raise RoteiroInterrompido(
            Passo.SESSAO if pede_login(pagina.url_atual()) else Passo.ARQUIVO,
            "a pagina de upload nao carregou",
        )
    feitos.append(Passo.SESSAO)

    _passo(
        pagina.enviar_arquivo,
        Passo.ARQUIVO,
        "campo_do_arquivo",
        video,
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    feitos.append(Passo.ARQUIVO)

    # O TikTok abre um tour de novidades por cima da página, com um OVERLAY que
    # engole cliques. Ele apareceu na primeira execução real e travaria tudo o
    # que vem depois. Dispensar é best-effort: não achar o tour é o caso normal.
    _dispensar_tutorial(pagina)

    # D-545: esperar o upload TERMINAR antes de escrever qualquer coisa.
    #
    # A ordem anterior era "escreve enquanto a barra sobe", pela analogia com o
    # que uma pessoa faz. A analogia falhava num detalhe que decide tudo: ao
    # aceitar o arquivo, o TikTok PREENCHE a caixa da legenda com o nome dele.
    # Uma pessoa vê isso acontecer por cima do que digitou e corrige; o robô
    # escrevia antes, era sobrescrito, e seguia em frente convencido.
    #
    # Num clipe de teste de 23 KB o preenchimento chegava antes de nós e nada
    # aparecia. Num corte de verdade ele chega depois. O ensaio passou e a
    # execução real falhou pelo mesmo motivo — a assinatura de uma corrida, e
    # não de lentidão.
    _passo(
        pagina.esperar_texto,
        Passo.PROCESSAMENTO,
        "status_do_upload",
        ENVIO_CONCLUIDO,
        segundos=SEGUNDOS_PARA_PROCESSAR,
    )
    _passo(
        pagina.esperar_habilitado,
        Passo.PROCESSAMENTO,
        "botao_publicar",
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    feitos.append(Passo.PROCESSAMENTO)

    # Escrever e CONFERIR. Um `escrever` que não levanta exceção não prova que o
    # texto ficou: prova que o clique e as teclas foram aceitos. Numa página que
    # se redesenha sozinha, as duas coisas são diferentes.
    _passo(
        pagina.escrever,
        Passo.LEGENDA,
        "editor_da_legenda",
        legenda,
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    if _confirmar_legenda(pagina, legenda):
        feitos.append(Passo.LEGENDA)
    else:
        avisos.append(
            "Escrevi a legenda mas nao consegui confirmar que ela ficou. "
            "Confira na aba antes de publicar."
        )

    if capa and capa.is_file():
        erro = _tentar_capa(pagina, capa)
        if erro:
            # Passo opcional: o vídeo já subiu e a legenda já está escrita.
            # Derrubar tudo aqui trocaria um contratempo por um retrabalho.
            avisos.append(erro)
            logger.warning("[TikTokStudio] capa nao entrou: %s", erro)
        else:
            feitos.append(Passo.CAPA)
    elif capa:
        avisos.append("A capa nao esta mais em disco; o TikTok vai congelar um frame.")

    feitos.append(Passo.REVISAO)

    return {
        "passos": [p.value for p in feitos],
        "resumo": descricao_do_progresso(feitos),
        "capa_aplicada": Passo.CAPA in feitos,
        "avisos": avisos,
        "publicado": False,
    }


def _mesma_linha(a: str, b: str) -> bool:
    r"""Compara ignorando como cada lado quebrou os espaços.

    O editor da legenda é um DraftJS: devolve o texto com quebras próprias, e
    comparar caractere a caractere acusaria diferença onde não há.

    >>> _mesma_linha("O juro\n\n#pix", "O  juro #pix")
    True
    >>> _mesma_linha("uma coisa", "outra coisa")
    False
    """
    return " ".join(a.split()) == " ".join(b.split())


def _confirmar_legenda(pagina: Pagina, legenda: str, tentativas: int = 3) -> bool:
    """Lê a legenda de volta, e reescreve enquanto não bater.

    A corrida com o preenchimento automático do TikTok não tem instante fixo
    para acabar — depende do tamanho do arquivo e da rede. Em vez de escolher
    uma espera e torcer, escrevemos, LEMOS e repetimos. Três tentativas porque
    a partir daí o problema é outro, e insistir só atrasa a entrega da aba.
    """
    for tentativa in range(tentativas):
        try:
            if _mesma_linha(pagina.texto_de("editor_da_legenda"), legenda):
                return True
            pagina.escrever("editor_da_legenda", legenda, segundos=SEGUNDOS_PARA_ELEMENTO)
        except Exception as exc:  # noqa: BLE001 — vira aviso, não interrupção
            logger.warning("[TikTokStudio] nao consegui reescrever a legenda: %s", exc)
            return False
        logger.info("[TikTokStudio] legenda nao bateu; reescrevi (%s)", tentativa + 1)

    try:
        return _mesma_linha(pagina.texto_de("editor_da_legenda"), legenda)
    except Exception:  # noqa: BLE001 — não conseguir ler não é o mesmo que falhar
        return False


def _miniatura_da_capa(pagina: Pagina) -> str:
    """O `src` da miniatura da capa, ou vazio quando não dá para ler."""
    try:
        return pagina.atributo_de("miniatura_da_capa", "src")
    except Exception:  # noqa: BLE001 — sem miniatura a comparação é inconclusiva
        return ""


def _dispensar_tutorial(pagina: Pagina) -> None:
    """Tira o tour de novidades da frente. Nunca falha, e insiste até sair.

    Não é firula. O tour vem com um `react-joyride__overlay` que cobre a página
    inteira e intercepta pointer events: com ele aberto, o clique na caixa da
    legenda é retentado por 30s e morre em "elemento não clicável" — um sintoma
    que não aponta para a causa nenhuma vez.

    A primeira versão disto clicava em "Entendi" e pronto. O ensaio contra a
    página real mostrou os dois furos: o tour aparece DEPOIS do upload começar
    (a checagem de 3s chegava antes dele), e o botão nem sempre diz "Entendi" —
    num passo intermediário do tour diz "Avançar", e clicar ali só avança.

    Então são duas camadas. Primeiro esperamos o overlay APARECER e tentamos
    fechá-lo como uma pessoa fecharia. Se ele insistir, removemos o portal do
    DOM — é um tooltip decorativo, não um controle da publicação, e deixá-lo
    ali custa o roteiro inteiro.
    """
    try:
        # `visivel=False`: interessa que o portal esteja no DOM. Este mesmo
        # wait dá ao tour o tempo de nascer — ele vem depois do upload.
        if not pagina.existe("overlay_do_tutorial", segundos=SEGUNDOS_PARA_TUTORIAL, visivel=False):
            return

        if pagina.existe("tutorial", segundos=2.0):
            pagina.clicar("tutorial", segundos=5.0)
            logger.info("[TikTokStudio] tour dispensado no botao")

        if pagina.existe("overlay_do_tutorial", segundos=2.0, visivel=False):
            pagina.remover("overlay_do_tutorial")
            logger.info("[TikTokStudio] overlay do tour removido do DOM")
    except Exception as exc:  # noqa: BLE001 — o tour nunca pode derrubar o upload
        logger.debug("[TikTokStudio] tour: %s", exc)


def _tentar_capa(pagina: Pagina, capa: Path) -> str:
    """Troca a capa, devolvendo o motivo quando não dá — e nunca levantando.

    Abrir um modal, entregar o arquivo ao input escondido e salvar. É o passo
    mais frágil do roteiro e o menos importante dos cinco, nesta ordem exata;
    por isso ele é o único que reporta em vez de interromper.

    Não há passo de "clicar em Upload cover": o `<input type=file>` do modal já
    nasce no DOM, e entregar o arquivo direto a ele dispensa o clique na área
    de arrastar — que é só a fachada dele.
    """
    try:
        if not pagina.existe("botao_da_capa", segundos=SEGUNDOS_PARA_CAPA):
            return "Nao achei o botao de editar capa."
        pagina.clicar("botao_da_capa", segundos=SEGUNDOS_PARA_CAPA)

        # A miniatura de ANTES: é ela que dirá se a troca pegou.
        antes = _miniatura_da_capa(pagina)

        pagina.enviar_arquivo("campo_da_capa", capa, segundos=SEGUNDOS_PARA_CAPA)

        if not pagina.existe("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA):
            return "O modal da capa abriu, mas nao achei o botao de salvar."

        # D-545: ESPERAR o Salvar habilitar antes de clicar.
        #
        # O relato foi exato: abrindo o editor depois, a imagem estava lá,
        # escolhida e não salva. Ou seja, o `set_input_files` pegou e o clique
        # em Salvar não. O TikTok mantém o botão desabilitado enquanto processa
        # a imagem que acabou de receber, e um clique nesse intervalo não é
        # recusado com erro — ele simplesmente não acontece.
        pagina.esperar_habilitado("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
        pagina.clicar("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
        pagina.esperar_sumir("dialogo", segundos=SEGUNDOS_PARA_CAPA)

        # Diálogo ainda aberto = o clique não fechou nada. Uma segunda tentativa
        # cobre o caso de o primeiro ter pego o botão no meio da habilitação.
        if pagina.existe("dialogo", segundos=1.0):
            pagina.clicar("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
            pagina.esperar_sumir("dialogo", segundos=SEGUNDOS_PARA_CAPA)

        if _miniatura_da_capa(pagina) == antes:
            return "Cliquei em salvar, mas a capa na pagina continua a mesma."
        return ""
    except Exception as exc:  # noqa: BLE001 — qualquer falha aqui vira aviso
        return f"{type(exc).__name__}: {exc}"


def _passo(funcao, passo: Passo, *args, **kwargs) -> None:
    """Roda um verbo da página traduzindo qualquer falha para o passo.

    Sem isto, o que chega à tela é o `TimeoutError` cru do Playwright com um
    seletor CSS dentro — verdadeiro, inútil, e assustador para quem só queria
    publicar um corte.
    """
    try:
        funcao(*args, **kwargs)
    except RoteiroInterrompido:
        raise
    except Exception as exc:  # noqa: BLE001 — a origem varia, o destino não
        raise RoteiroInterrompido(passo, f"{type(exc).__name__}: {exc}") from exc


# --------------------------------------------------------------------------
# A camada que fala Playwright
# --------------------------------------------------------------------------


class PaginaDoPlaywright:
    """`Pagina` de verdade, sobre uma `page` do Playwright síncrono."""

    def __init__(self, page) -> None:
        self._page = page

    def _css(self, alvo: str) -> str:
        return SELETORES[alvo]

    def abrir(self, url: str, *, segundos: float) -> None:
        self._page.goto(url, timeout=segundos * 1000, wait_until="domcontentloaded")

    def url_atual(self) -> str:
        return self._page.url

    def enviar_arquivo(self, alvo: str, caminho: Path, *, segundos: float) -> None:
        """Entrega o arquivo ao `<input type=file>` — por CDP, e não pelo Playwright.

        A área de arrastar do TikTok é um input escondido por CSS: não há nada a
        arrastar, e simular o arrasto seria inventar dificuldade.

        O que NÃO dá para usar é o `set_input_files` do Playwright. Ele empacota
        o conteúdo do arquivo e manda pelo protocolo, e recusa acima de 50 MB
        ("Cannot transfer files larger than 50Mb to a browser not co-located
        with the server"). O TikTok aceita 30 GB; o teto é nosso, e nasce de a
        gente falar com o Chrome por CDP em vez de tê-lo lançado.

        `DOM.setFileInputFiles` resolve porque inverte quem lê o arquivo: nós
        mandamos o CAMINHO, e o Chrome abre do disco dele. Como ele roda na
        mesma máquina, o caminho vale — e o tamanho deixa de passar por nós.
        """
        campo = self._page.locator(self._css(alvo)).first
        campo.wait_for(state="attached", timeout=segundos * 1000)
        try:
            self._entregar_por_cdp(self._css(alvo), caminho)
        except Exception as exc:  # noqa: BLE001 — o caminho do Playwright é a retaguarda
            logger.info("[TikTokStudio] CDP nao entregou o arquivo (%s); tentando direto", exc)
            campo.set_input_files(str(caminho), timeout=segundos * 1000)

    def _entregar_por_cdp(self, css: str, caminho: Path) -> None:
        """Diz ao Chrome QUAL arquivo abrir, em vez de mandar os bytes.

        O seletor tem de ser CSS de verdade: quem resolve aqui é o
        `querySelector` do navegador, que não conhece os pseudo-seletores do
        Playwright (`:has-text`). Há teste guardando isso para as duas chaves
        que passam por aqui.
        """
        sessao = self._page.context.new_cdp_session(self._page)
        try:
            sessao.send("DOM.enable")
            achado = sessao.send(
                "Runtime.evaluate",
                {"expression": f"document.querySelector({json.dumps(css)})"},
            )
            identificador = achado.get("result", {}).get("objectId")
            if not identificador:
                raise RuntimeError(f"{css} nao resolveu para um elemento")
            sessao.send(
                "DOM.setFileInputFiles",
                {"files": [str(caminho.resolve())], "objectId": identificador},
            )
        finally:
            sessao.detach()

    def escrever(self, alvo: str, texto: str, *, segundos: float) -> None:
        campo = self._page.locator(self._css(alvo)).first
        campo.wait_for(state="visible", timeout=segundos * 1000)
        campo.click(timeout=segundos * 1000)
        self._page.keyboard.press("Control+A")
        self._page.keyboard.press("Delete")
        # `insert_text` entrega o texto de uma vez, sem disparar o teclado
        # tecla a tecla. Digitar caractere a caractere abriria o menu de
        # sugestão de hashtag a cada "#", e a primeira sugestão aceita no
        # caminho trocaria a tag escrita por outra parecida.
        self._page.keyboard.insert_text(texto)
        # O "#" abre o menu de sugestão de hashtag do TikTok. Deixá-lo aberto
        # faz o próximo clique cair na sugestão em vez de no que se queria.
        self._page.keyboard.press("Escape")

    def clicar(self, alvo: str, *, segundos: float) -> None:
        self._page.locator(self._css(alvo)).first.click(timeout=segundos * 1000)

    def existe(self, alvo: str, *, segundos: float, visivel: bool = True) -> bool:
        try:
            self._page.locator(self._css(alvo)).first.wait_for(
                state="visible" if visivel else "attached", timeout=segundos * 1000
            )
            return True
        except Exception:  # noqa: BLE001 — ausência não é erro, é resposta
            return False

    def texto_de(self, alvo: str) -> str:
        return self._page.locator(self._css(alvo)).first.inner_text()

    def atributo_de(self, alvo: str, atributo: str) -> str:
        return self._page.locator(self._css(alvo)).first.get_attribute(atributo) or ""

    def esperar_sumir(self, alvo: str, *, segundos: float) -> None:
        try:
            self._page.locator(self._css(alvo)).first.wait_for(
                state="detached", timeout=segundos * 1000
            )
        except Exception:  # noqa: BLE001 — não sumir não é motivo para parar
            logger.debug("[TikTokStudio] %s continuou na tela", alvo)

    def remover(self, alvo: str) -> None:
        self._page.evaluate(
            "(css) => document.querySelectorAll(css).forEach((el) => el.remove())",
            self._css(alvo),
        )

    def esperar_texto(self, alvo: str, padrao: str, *, segundos: float) -> None:
        self._page.locator(self._css(alvo)).filter(
            has_text=re.compile(padrao, re.IGNORECASE)
        ).first.wait_for(state="attached", timeout=segundos * 1000)

    def esperar_habilitado(self, alvo: str, *, segundos: float) -> None:
        botao = self._page.locator(self._css(alvo)).first
        botao.wait_for(state="visible", timeout=segundos * 1000)
        limite = time.monotonic() + segundos
        while time.monotonic() < limite:
            if botao.is_enabled():
                return
            self._page.wait_for_timeout(1000)
        raise TimeoutError(f"{alvo} nao habilitou em {segundos:.0f}s")


def perfil_do_chrome() -> Path:
    """Onde mora a sessão do TikTok deste canal.

    Dentro do canal, e não num temp: a graça é o operador logar UMA vez. E por
    canal, e não global, porque quem tem dois canais tem duas contas — um perfil
    só faria o segundo canal publicar no primeiro, silenciosamente.
    """
    return active_channel_root() / "browser" / "tiktok"


def _chrome_no_disco() -> Path | None:
    candidatos = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path.home() / "AppData/Local/Google/Chrome/Application/chrome.exe",
    ]
    for caminho in candidatos:
        if caminho.is_file():
            return caminho
    achado = shutil.which("chrome") or shutil.which("google-chrome")
    return Path(achado) if achado else None


def _porta_responde(porta: int) -> bool:
    """Há um Chrome VIVO falando DevTools nesta porta?

    A primeira versão disto abria um socket e considerava resposta de TCP como
    "está no ar". Não é: quando o operador fecha a janela, a porta continua
    aceitando conexão por um tempo, e aí `garantir_chrome` decide que não
    precisa abrir nada. O que chegava depois era um `TargetClosedError` cru do
    Playwright — verdadeiro, e mudo sobre a única coisa que importava: a janela
    tinha sido fechada.

    Perguntar ao endpoint do DevTools resolve porque só um Chrome de verdade
    responde a ele.
    """
    import json as _json
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(  # noqa: S310 — localhost, porta nossa
            f"http://127.0.0.1:{porta}/json/version", timeout=1.5
        ) as resposta:
            return "webSocketDebuggerUrl" in _json.loads(resposta.read())
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return False


def garantir_chrome() -> bool:
    """Deixa um Chrome de depuração no ar, e diz se precisou abrir um.

    Reaproveita o que já estiver escutando na porta: publicar cinco cortes
    seguidos deve usar a mesma janela, e não empilhar cinco.
    """
    if _porta_responde(PORTA_DE_DEPURACAO):
        return False

    chrome = _chrome_no_disco()
    if chrome is None:
        raise RoteiroInterrompido(Passo.ABRIR, "nao encontrei o Chrome instalado nesta maquina")

    perfil = perfil_do_chrome()
    perfil.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(  # noqa: S603 — caminho conhecido, argumentos nossos
        [
            str(chrome),
            f"--remote-debugging-port={PORTA_DE_DEPURACAO}",
            f"--user-data-dir={perfil}",
            "--no-first-run",
            "--no-default-browser-check",
            URL_DO_UPLOAD,
        ],
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
    )

    limite = time.monotonic() + 30
    while time.monotonic() < limite:
        if _porta_responde(PORTA_DE_DEPURACAO):
            return True
        time.sleep(0.5)
    raise RoteiroInterrompido(Passo.ABRIR, "o Chrome nao abriu a porta de depuracao")


def _assistir(video: Path, legenda: str, capa: Path | None) -> dict:
    """Tudo o que fala Playwright, num thread só (síncrono de propósito).

    A API assíncrona do Playwright cria subprocessos pelo event loop, e no
    Windows sob uvicorn isso falha (D-369). A síncrona num thread é o padrão
    que o resto deste projeto já usa pelo mesmo motivo.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        # Dependencia opcional: sem ela o app inteiro continua de pe e so este
        # botao para. Dizer isso aqui e o que evita um ImportError cru na tela.
        raise RoteiroInterrompido(
            Passo.ABRIR,
            "o Playwright nao esta instalado; rode `pip install playwright`",
        ) from exc

    abriu_agora = garantir_chrome()

    pw = sync_playwright().start()
    try:
        navegador = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{PORTA_DE_DEPURACAO}")
        contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
        page = contexto.new_page()
        relatorio = executar_roteiro(
            PaginaDoPlaywright(page), video=video, legenda=legenda, capa=capa
        )
        return {**relatorio, "chrome_aberto_agora": abriu_agora}
    finally:
        # `stop` desconecta; não fecha o Chrome, que é um processo à parte.
        # É exatamente por isso que a aba sobrevive para o operador revisar.
        pw.stop()


async def subir_assistido(*, video: Path, legenda: str, capa: Path | None = None) -> dict:
    """Deixa o post pronto para o operador conferir e publicar.

    Levanta `RoteiroInterrompido`, cuja mensagem já é a instrução para a tela.
    """
    if not video.is_file():
        raise RoteiroInterrompido(Passo.ARQUIVO, "o MP4 do pacote nao esta em disco")

    logger.info("[TikTokStudio] subindo %s", video.name)
    return await asyncio.to_thread(_assistir, video, legenda, capa)

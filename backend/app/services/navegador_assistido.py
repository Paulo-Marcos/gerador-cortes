"""A camada que fala com o Chrome — comum a todo destino assistido (D-564).

## Por que ela saiu do `tiktok_studio`

Porque nasceu ali por acaso, não por pertencimento. Abrir o Chrome do operador,
achar a porta certa, entregar um arquivo ao `<input type=file>` por CDP, esperar
um botão habilitar: nada disso é TikTok. É navegador.

A prova veio quando o Instagram chegou (D-564, onda 3): ou este código se movia,
ou seria copiado inteiro para um segundo arquivo — e no dia em que o Chrome
mudasse de comportamento, o conserto teria de acontecer duas vezes, em dois
lugares que ninguém lembraria de manter iguais.

## O que ela deliberadamente NÃO sabe

Nenhum seletor, nenhuma sequência de passos, nenhuma plataforma. `Pagina` tem
verbos e chaves; QUEM traduz a chave em CSS é o mapa que cada destino injeta.
É isso que mantém os roteiros testáveis com um dublê de vinte linhas.

E não sabe senha. Ver o docstring de `tiktok_studio`: se um dia alguém
"resolver" o login, o teste de intenção quebra.
"""

from __future__ import annotations

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
    PORTA_MINIMA_DE_DEPURACAO,
    PORTAS_DE_DEPURACAO,
    mesma_pasta,
    perfil_na_linha_de_comando,
    porta_de_depuracao,
)

logger = logging.getLogger(__name__)


class NavegadorIndisponivel(RuntimeError):
    """Nao deu para colocar um Chrome de depuracao no ar para este perfil.

    Excecao PROPRIA, e nao a do roteiro do TikTok: esta camada nao sabe em que
    passo de que plataforma ela foi chamada. Quem sabe e o roteiro, e e ele que
    traduz isto para "falhou ao abrir" com a orientacao certa.
    """


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
    def clicar_opcao(self, alvo: str, texto: str, *, segundos: float) -> bool: ...
    def valor_de(self, alvo: str) -> str: ...
    def existe(self, alvo: str, *, segundos: float, visivel: bool = True) -> bool: ...
    def esperar_texto(self, alvo: str, padrao: str, *, segundos: float) -> None: ...
    def esperar_habilitado(self, alvo: str, *, segundos: float) -> None: ...
    def remover(self, alvo: str) -> None: ...
    def texto_de(self, alvo: str) -> str: ...
    def atributo_de(self, alvo: str, atributo: str) -> str: ...
    def esperar_sumir(self, alvo: str, *, segundos: float) -> None: ...
    def marcar(self, nome: str) -> None: ...
    def nome_da_janela(self) -> str: ...


class PaginaDoPlaywright:
    """`Pagina` de verdade, sobre uma `page` do Playwright síncrono."""

    def __init__(
        self,
        page,
        seletores: dict[str, str] | None = None,
        *,
        escapar_apos_escrever: bool = True,
    ) -> None:
        self._page = page
        # O mapa vem de fora porque ele É a plataforma. Sem isso esta classe
        # voltaria a conhecer o TikTok, que é o acoplamento que a mudança desfez.
        self._seletores = seletores or {}
        # E o Escape depois de digitar também é da plataforma, não da casa.
        # Ver `escrever`: no TikTok ele fecha o menu de hashtag; no Instagram
        # ele abre "Descartar publicação?".
        self._escapar_apos_escrever = escapar_apos_escrever

    def _css(self, alvo: str) -> str:
        return self._seletores[alvo]

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
            logger.info("[Navegador] CDP nao entregou o arquivo (%s); tentando direto", exc)
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
        # O "#" abre o menu de sugestão de hashtag do TikTok, e deixá-lo aberto
        # faz o próximo clique cair na sugestão em vez de no que se queria.
        #
        # MEDIDO em 10/09/2026: no Instagram esse mesmo Escape abre o diálogo
        # "Descartar publicação?" por cima do compositor — o post inteiro a um
        # clique de ser jogado fora. Por isso quem decide é a plataforma, e o
        # default continua sendo o do TikTok, onde o gesto nasceu.
        if self._escapar_apos_escrever:
            self._page.keyboard.press("Escape")

    def clicar(self, alvo: str, *, segundos: float) -> None:
        self._page.locator(self._css(alvo)).first.click(timeout=segundos * 1000)

    def clicar_opcao(self, alvo: str, texto: str, *, segundos: float) -> bool:
        """Clica a opcao cujo texto e EXATAMENTE `texto`, e diz se conseguiu.

        Existe porque calendario e seletor de hora nao tem chave propria por
        opcao: sao trinta e um dias com a mesma classe, distinguidos so pelo
        que esta escrito. A alternativa seria o roteiro montar CSS com o dia
        dentro — e aí a plataforma teria vazado para fora do mapa.

        Ancorado nas pontas (`^...$`) de proposito: sem isso, procurar o dia 1
        casaria com 1, 10, 11 e 21, e o robo clicaria no primeiro que achasse.

        Devolve `False` em vez de levantar porque "essa opcao nao esta na tela"
        e uma resposta que o roteiro sabe usar — virar o mes, por exemplo.
        """
        opcao = (
            self._page.locator(self._css(alvo))
            .filter(has_text=re.compile(rf"^\s*{re.escape(texto)}\s*$"))
            .first
        )
        try:
            opcao.click(timeout=segundos * 1000)
            return True
        except Exception:  # noqa: BLE001 — ausência é resposta, não falha
            return False

    def valor_de(self, alvo: str) -> str:
        """O que o campo mostra AGORA — a propriedade, nao o atributo.

        `atributo_de(alvo, "value")` devolveria o valor que veio no HTML, que
        numa tela React e o inicial e nao o atual. Aqui a diferenca nao e
        teorica: os campos de data e hora do TikTok sao `readonly` e so mudam
        por clique no seletor, entao o atributo nunca acompanha. Ler a
        propriedade e o unico jeito de CONFERIR que o clique pegou.
        """
        try:
            return self._page.locator(self._css(alvo)).first.input_value(timeout=5000)
        except Exception:  # noqa: BLE001 — campo sumiu ou nao e input
            return ""

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
            logger.debug("[Navegador] %s continuou na tela", alvo)

    def remover(self, alvo: str) -> None:
        self._page.evaluate(
            "(css) => document.querySelectorAll(css).forEach((el) => el.remove())",
            self._css(alvo),
        )

    def esperar_texto(self, alvo: str, padrao: str, *, segundos: float) -> None:
        self._page.locator(self._css(alvo)).filter(
            has_text=re.compile(padrao, re.IGNORECASE)
        ).first.wait_for(state="attached", timeout=segundos * 1000)

    def marcar(self, nome: str) -> None:
        """Escreve a etiqueta em `window.name` — a unica coisa da aba que
        sobrevive a navegacao dela, e por isso o gancho certo para a vigilia."""
        self._page.evaluate("(nome) => { window.name = nome; }", nome)

    def nome_da_janela(self) -> str:
        try:
            return str(self._page.evaluate("() => window.name") or "")
        except Exception:  # noqa: BLE001 — aba morta ou navegando: nao e a nossa
            return ""

    def esperar_habilitado(self, alvo: str, *, segundos: float) -> None:
        botao = self._page.locator(self._css(alvo)).first
        botao.wait_for(state="visible", timeout=segundos * 1000)
        limite = time.monotonic() + segundos
        while time.monotonic() < limite:
            if botao.is_enabled():
                return
            self._page.wait_for_timeout(1000)
        raise TimeoutError(f"{alvo} nao habilitou em {segundos:.0f}s")


def perfil_do_canal(plataforma: str) -> Path:
    """Onde mora a sessão DAQUELA plataforma neste canal.

    Dentro do canal, e não num temp: a graça é o operador logar UMA vez. E por
    canal, e não global, porque quem tem dois canais tem duas contas — um perfil
    só faria o segundo canal publicar no primeiro, silenciosamente.

    Por plataforma pelo mesmo motivo, um nível abaixo: a sessão do Instagram não
    tem nada a ver com a do TikTok, e um perfil compartilhado faria o Chrome de
    uma delas herdar cookies da outra.
    """
    return active_channel_root() / "browser" / plataforma


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


# Quantas portas adiante a gente procura quando a preferida ja e de outro perfil.
#
# A porta sai de um hash do caminho, e hash colide: medido, com quatro perfis na
# maquina a chance de duas caírem na mesma e ~6,5%. Colidir silenciosamente seria
# reencenar o bug que tudo isto existe para matar — dois donos, uma porta.
#
# Oito saltos cobrem qualquer maquina de um operador com folga.
PORTAS_A_TENTAR = 8


def perfil_na_porta(porta: int) -> str:
    """De quem e o Chrome que atende nesta porta, ou "" se nao der para saber.

    Le a linha de comando do processo que escuta ali. E a unica resposta
    confiavel: o CDP nao conta qual perfil o navegador abriu, e "responde na
    porta" nao diz nada sobre QUEM responde — foi exatamente o que fez o backend
    de DEV conectar no Chrome de PROD.

    Vazio quando nao da para ler (processo de outro usuario, psutil sem
    permissao). Vazio nunca casa com perfil nenhum, entao o caso duvidoso
    empurra para a porta seguinte em vez de assumir que a janela e nossa.
    """
    try:
        import psutil
    except ImportError:  # pragma: no cover - so acontece em ambiente incompleto
        # Em voz alta, e nao com um `return ""` mudo: sem psutil a resposta e
        # SEMPRE "nao sei", e "nao sei" faz o robo abandonar a porta do proprio
        # perfil e tentar abrir um segundo Chrome sobre um perfil ja aberto —
        # que o Chrome recusa entregando a URL para a janela existente. O
        # sintoma que chega ao operador e "a aba abriu e nada subiu", a tres
        # camadas de distancia da causa. Custou uma investigacao; agora o log
        # diz o que instalar.
        logger.warning(
            "[Navegador] psutil ausente: nao da para saber de quem e a janela na "
            "porta %s, e o robo vai evitar uma porta que talvez seja dele mesmo. "
            "Instale psutil (esta no requirements.txt).",
            porta,
        )
        return ""

    try:
        for conexao in psutil.net_connections(kind="inet"):
            if not conexao.laddr or conexao.laddr.port != porta or not conexao.pid:
                continue
            if conexao.status != psutil.CONN_LISTEN:
                continue
            return perfil_na_linha_de_comando(psutil.Process(conexao.pid).cmdline())
    except Exception as exc:  # noqa: BLE001 — nao saber e uma resposta valida
        logger.debug("[Navegador] nao consegui ler o dono da porta %s: %s", porta, exc)
    return ""


def porta_do_chrome(perfil: Path) -> int:
    """A porta DESTE perfil: a preferida, ou a proxima que nao seja de outro.

    A preferida vem do caminho (deterministica, para reencontrar a janela entre
    um item do lote e o seguinte). Quando ela ja esta ocupada por OUTRO perfil,
    a gente anda — porque insistir ali significaria dirigir a janela alheia.
    """
    preferida = porta_de_depuracao(str(perfil))
    for salto in range(PORTAS_A_TENTAR):
        porta = PORTA_MINIMA_DE_DEPURACAO + (
            (preferida - PORTA_MINIMA_DE_DEPURACAO + salto) % PORTAS_DE_DEPURACAO
        )
        if not _porta_responde(porta):
            return porta
        if mesma_pasta(perfil_na_porta(porta), str(perfil)):
            return porta
        logger.info("[Navegador] porta %s e de outro perfil; tentando a seguinte", porta)
    raise NavegadorIndisponivel(
        f"as {PORTAS_A_TENTAR} portas a partir de {preferida} estao ocupadas por "
        "outros perfis; feche um Chrome de depuracao e tente de novo"
    )


def garantir_chrome(perfil: Path, url: str) -> bool:
    """Deixa um Chrome de depuração no ar PARA ESTE PERFIL, e diz se abriu um.

    Reaproveita o que já estiver escutando na porta DELE: publicar cinco cortes
    seguidos deve usar a mesma janela, e não empilhar cinco. O que ele nunca
    mais faz é reaproveitar a janela de OUTRO perfil — ver a nota da porta.
    """
    porta = porta_do_chrome(perfil)
    if _porta_responde(porta):
        return False

    chrome = _chrome_no_disco()
    if chrome is None:
        raise NavegadorIndisponivel("nao encontrei o Chrome instalado nesta maquina")

    perfil.mkdir(parents=True, exist_ok=True)
    subprocess.Popen(  # noqa: S603 — caminho conhecido, argumentos nossos
        [
            str(chrome),
            f"--remote-debugging-port={porta}",
            f"--user-data-dir={perfil}",
            "--no-first-run",
            "--no-default-browser-check",
            url,
        ],
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
    )

    limite = time.monotonic() + 30
    while time.monotonic() < limite:
        if _porta_responde(porta):
            return True
        time.sleep(0.5)
    raise NavegadorIndisponivel(
        f"o Chrome nao abriu a porta {porta}; se ja ha uma janela deste perfil "
        "aberta por fora, feche-a e tente de novo"
    )


def aba_marcada(contexto, marca: str, url_padrao: str = ""):
    """A aba etiquetada com `marca`, ou `None`.

    Com marca, procura a etiqueta e ignora a URL: a aba pode ter navegado entre
    o preparo e a vigília, e exigir uma URL ali faria perder justamente a aba
    que acabou de publicar.

    Sem marca, cai no critério antigo — a primeira aba cuja URL contém
    `url_padrao`. É o que o botão avulso do TikTok (D-537) ainda usa.
    """
    from app.domain.tiktok_studio import e_a_aba_marcada

    if not marca:
        return next((p for p in contexto.pages if url_padrao and url_padrao in p.url), None)

    for pagina in contexto.pages:
        if e_a_aba_marcada(PaginaDoPlaywright(pagina).nome_da_janela(), marca):
            return pagina
    return None

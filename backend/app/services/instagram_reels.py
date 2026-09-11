"""Upload assistido de Reels no instagram.com, pelo Chrome do operador (D-564).

O irmão do `tiktok_studio`, e de propósito com a mesma forma: um roteiro que
fala em intenções (`Pagina`), um mapa de seletores num lugar só, e uma falha que
diz QUAL passo quebrou. A camada que fala Playwright é a mesma — `navegador_assistido`.

## Os seletores foram MEDIDOS (10/09/2026)

Calibrados contra a página real, numa sessão logada, com o roteiro completo
rodando de ponta a ponta. Quatro palpites meus morreram ali, e vale registrar
quais — é o que poupa a próxima pessoa:

1. **O botão de criar é "Novo post"**, não "Nova publicação" nem "New post".
2. **A legenda é um `contenteditable`** com `aria-label="Adicione uma legenda..."`,
   e não um `<textarea>`. Ancorar só em `div[contenteditable]` pegaria qualquer
   campo rico que o modal venha a ter.
3. **O Instagram abre um cartão "Saiba mais sobre o Reels"** logo depois do
   upload, e ele INTERCEPTA cliques — o mesmo mal do tour do TikTok (D-537). Sem
   dispensá-lo, o clique em Avançar morre em "elemento não clicável".
4. **O `Escape` do fim da digitação abre "Descartar publicação?"** aqui. No
   TikTok ele fecha o menu de hashtag; era hábito da casa virando traço da
   plataforma. Hoje é decisão de quem constrói a página (ver
   `escapar_apos_escrever`).

E o compositor tem **duas** etapas de "Avançar" hoje (cortar → editar/capa →
legenda). O roteiro não conta cliques de propósito: espera pela legenda.

O que continua sem prova, e é honesto dizer: `aviso_de_sucesso`. Ele só aparece
depois de um post de verdade, e a calibração parou antes disso. É por isso que
não achá-lo devolve "não sei" em vez de "não publicou".

## Por que o perfil é separado do TikTok

`instance/channels/<canal>/browser/instagram`. Sessões diferentes, contas
diferentes; e com a porta derivada do caminho (D-564), os dois Chromes nunca se
encontram — nem entre si, nem com o de outro checkout.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from app.domain.instagram_reels import (
    Passo,
    RoteiroInterrompido,
    descricao_do_progresso,
    pede_login,
    publicou,
)
from app.services.navegador_assistido import (
    NavegadorIndisponivel,
    Pagina,
    PaginaDoPlaywright,
    aba_marcada,
    garantir_chrome,
    perfil_do_canal,
    porta_do_chrome,
)

logger = logging.getLogger(__name__)

URL_INICIAL = "https://www.instagram.com/"

# A subpasta da sessão dentro do canal ativo.
PERFIL = "instagram"

SEGUNDOS_PARA_ABRIR = 45.0
SEGUNDOS_PARA_SESSAO = 20.0
SEGUNDOS_PARA_ELEMENTO = 30.0
SEGUNDOS_PARA_PROCESSAR = 600.0
# O cartao do Reels nasce depois do upload comecar; esta espera e o que da tempo
# de ele aparecer. Curta: nao achar e o caso normal.
SEGUNDOS_PARA_AVISO = 6.0
INTERVALO_DA_VIGILIA = 3.0
SEGUNDOS_DE_VIGILIA = 1800.0
SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO = 120.0

# Quantas vezes clicamos em "Avançar" antes de desistir.
#
# O compositor tem etapas intermediárias (recorte, filtros) que o Instagram
# ADICIONA e REMOVE conforme o formato e o teste A/B do dia. Contar um número
# fixo de cliques seria acertar hoje e quebrar na semana que vem; então
# clicamos até a caixa da legenda aparecer, com um teto para não girar em falso.
MAXIMO_DE_AVANCOS = 4


# Os seletores, num lugar só. Ver o aviso no topo do módulo: estes NÃO foram
# medidos na página real, ao contrário dos do TikTok.
#
# A âncora preferida é `aria-label` e o texto do botão, porque o Instagram não
# publica ganchos de teste e as classes dele são geradas — `x1i10hfl x972fbf`
# muda a cada build e não significa nada para ninguém.
#
# Cada chave lista as variantes em português e inglês: a interface segue o
# idioma da conta, e um roteiro que só fala inglês falha na conta dele.
SELETORES: dict[str, str] = {
    # PURO CSS obrigatório: quem resolve é o `querySelector` do navegador, via
    # CDP (D-544) — nada de `:has-text` aqui.
    "campo_do_arquivo": 'input[type="file"][accept*="video"]',
    # MEDIDO em 10/09/2026: em portugues o rotulo e "Novo post" — nao "Nova
    # publicacao", que era o palpite. As outras variantes ficam como rede: a
    # interface segue o idioma da conta, e o rotulo ja mudou antes.
    #
    # O `:has()` sobe do <svg> para o elemento clicavel: o icone nao recebe o
    # clique, o container dele recebe.
    "botao_criar": (
        'a:has(svg[aria-label="Novo post"]), '
        'div[role="button"]:has(svg[aria-label="Novo post"]), '
        'a:has(svg[aria-label="New post"]), '
        'div[role="button"]:has(svg[aria-label="New post"]), '
        'a:has(svg[aria-label="Nova publicação"]), '
        'div[role="button"]:has(svg[aria-label="Nova publicação"])'
    ),
    "dialogo": 'div[role="dialog"]',
    # A porta de entrada. MEDIDO em 10/09/2026: deslogado, o Instagram serve o
    # formulario em `/` sem redirecionar, entao a URL nao denuncia nada — e sem
    # este sinal o roteiro diria "o menu mudou" para quem so precisa logar.
    #
    # `input[type=password]` na frente porque e o unico que nao depende de idioma
    # NEM do nome do campo: todo formulario de login tem um. Os nomes vem atras,
    # MEDIDOS em 10/09/2026 — o Instagram usa `email`/`pass` (o login unificado
    # da Meta), e nao os `username`/`password` que a gente tinha adivinhado.
    "marca_de_login": (
        'input[type="password"], '
        'input[name="email"], '
        'input[name="pass"], '
        'input[name="username"], '
        'a[href*="/accounts/login"]'
    ),
    # MEDIDO em 10/09/2026: logo depois do upload o Instagram abre um cartao
    # "Saiba mais sobre o Reels" com um OK — e ele INTERCEPTA os cliques, do
    # mesmo jeito que o tour do TikTok fazia (D-537). O clique em Avancar ficou
    # 20s sendo retentado e morreu em "elemento nao clicavel", um sintoma que
    # nao aponta para a causa uma vez sequer.
    "aviso_do_reels": 'div[role="dialog"] button:text-is("OK")',
    "botao_avancar": (
        'div[role="dialog"] div[role="button"]:text-is("Avançar"), '
        'div[role="dialog"] div[role="button"]:text-is("Next")'
    ),
    # MEDIDA em 10/09/2026: e um contenteditable com
    # `aria-label="Adicione uma legenda..."`, e nao um <textarea>. O rotulo vem
    # primeiro porque `div[contenteditable]` sozinho e generico demais — ele
    # pegaria qualquer campo rico que o modal venha a ter.
    "editor_da_legenda": (
        'div[role="dialog"] div[aria-label^="Adicione uma legenda"], '
        'div[role="dialog"] div[aria-label^="Write a caption"], '
        'div[role="dialog"] textarea[aria-label*="legenda"], '
        'div[role="dialog"] textarea[aria-label*="caption"], '
        'div[role="dialog"] div[contenteditable="true"]'
    ),
    "botao_compartilhar": (
        'div[role="dialog"] div[role="button"]:text-is("Compartilhar"), '
        'div[role="dialog"] div[role="button"]:text-is("Share")'
    ),
    # A confirmação, MEDIDA publicando de verdade em 10/09/2026. Ela não é um
    # aviso passageiro: é um diálogo que SUBSTITUI o compositor, com o texto
    # "Seu reel foi compartilhado." e um botão "Concluir".
    #
    # É o único sinal positivo do fluxo, e é o que separa publicar de descartar —
    # as duas ações tiram o compositor da frente, só uma confirma.
    "confirmacao_de_envio": (
        'div[role="dialog"]:has-text("Seu reel foi compartilhado"), '
        'div[role="dialog"]:has-text("Your reel has been shared"), '
        'div[role="dialog"]:has-text("foi compartilhado")'
    ),
    # MEDIDO: é `div[role=button]`, e não `<button>`. Fechá-lo deixa a aba limpa
    # para o próximo item do lote, em vez de empilhar confirmações.
    "botao_concluir": (
        'div[role="dialog"] div[role="button"]:text-is("Concluir"), '
        'div[role="dialog"] div[role="button"]:text-is("Done")'
    ),
}


def executar_roteiro(
    pagina: Pagina,
    *,
    video: Path,
    legenda: str,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Abre o compositor, sobe o Reel, escreve a legenda — e para no Compartilhar.

    Levanta `RoteiroInterrompido` no primeiro passo que falhar, sempre com a
    janela aberta: quem chama nunca fecha o navegador, e o modal pela metade é
    de onde o operador continua à mão.
    """
    feitos: list[Passo] = []
    avisos: list[str] = []

    _passo(pagina.abrir, Passo.ABRIR, URL_INICIAL, segundos=SEGUNDOS_PARA_ABRIR)
    feitos.append(Passo.ABRIR)

    # O redirecionamento para o login é do CLIENTE e chega DEPOIS do `goto`
    # retornar — a mesma armadilha que o TikTok pregou na D-537. Por isso a
    # decisão é esperada: ou o botão de criar aparece, ou a URL vira login.
    if pede_login(pagina.url_atual()):
        raise RoteiroInterrompido(Passo.SESSAO)
    if not pagina.existe("botao_criar", segundos=SEGUNDOS_PARA_SESSAO):
        # Sem o botao de criar, ha duas explicacoes muito diferentes: nao ha
        # sessao, ou o menu mudou de forma. Confundi-las manda o operador
        # investigar layout quando ele so precisava entrar na conta.
        sem_sessao = pede_login(pagina.url_atual()) or pagina.existe("marca_de_login", segundos=2.0)
        raise RoteiroInterrompido(
            Passo.SESSAO if sem_sessao else Passo.COMPOSITOR,
            "a home do Instagram nao carregou",
        )
    feitos.append(Passo.SESSAO)

    _passo(pagina.clicar, Passo.COMPOSITOR, "botao_criar", segundos=SEGUNDOS_PARA_ELEMENTO)
    # `visivel=False`: o `<input type=file>` do compositor é escondido por CSS —
    # o botão "Selecionar do computador" é a fachada dele.
    if not pagina.existe("campo_do_arquivo", segundos=SEGUNDOS_PARA_ELEMENTO, visivel=False):
        raise RoteiroInterrompido(Passo.COMPOSITOR, "o modal de criar publicacao nao abriu")
    feitos.append(Passo.COMPOSITOR)

    _passo(
        pagina.enviar_arquivo,
        Passo.ARQUIVO,
        "campo_do_arquivo",
        video,
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    feitos.append(Passo.ARQUIVO)

    # O cartao de novidades do Reels aparece DEPOIS do upload comecar, e cobre
    # a pagina. Dispensar e best-effort: nao achar e o caso normal.
    _dispensar_aviso(pagina)

    _avancar_ate_a_legenda(pagina)
    feitos.append(Passo.AVANCAR)

    _passo(
        pagina.escrever,
        Passo.LEGENDA,
        "editor_da_legenda",
        legenda,
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    if _legenda_ficou(pagina, legenda):
        feitos.append(Passo.LEGENDA)
    else:
        avisos.append(
            "Escrevi a legenda mas nao consegui confirmar que ela ficou. "
            "Confira no modal antes de compartilhar."
        )

    _passo(
        pagina.esperar_habilitado,
        Passo.REVISAO,
        "botao_compartilhar",
        segundos=SEGUNDOS_PARA_PROCESSAR,
    )
    feitos.append(Passo.REVISAO)

    if marca:
        _marcar_aba(pagina, marca)

    publicado = False
    if publicar_sozinho:
        _compartilhar_agora(pagina)
        feitos.append(Passo.PUBLICAR)
        publicado = True

    return {
        "passos": [p.value for p in feitos],
        "resumo": descricao_do_progresso(feitos),
        "avisos": avisos,
        "publicado": publicado,
    }


def _dispensar_aviso(pagina: Pagina) -> None:
    """Tira o cartao "Saiba mais sobre o Reels" da frente. Nunca falha.

    Nao e firula: MEDIDO em 10/09/2026, ele intercepta pointer events, e com ele
    aberto o clique em Avancar e retentado ate o timeout e morre dizendo
    "elemento nao clicavel" — um sintoma que nao aponta para a causa.
    """
    try:
        if pagina.existe("aviso_do_reels", segundos=SEGUNDOS_PARA_AVISO):
            pagina.clicar("aviso_do_reels", segundos=5.0)
            logger.info("[InstagramReels] aviso do Reels dispensado")
    except Exception as exc:  # noqa: BLE001 — o aviso nunca derruba o upload
        logger.debug("[InstagramReels] aviso: %s", exc)


def _avancar_ate_a_legenda(pagina: Pagina) -> None:
    """Clica em Avançar até a caixa da legenda aparecer.

    Contar cliques seria acertar a versão de hoje: as etapas intermediárias do
    compositor (recorte, filtros) vêm e vão. O que não muda é o DESTINO — a
    caixa da legenda —, então é por ela que a gente espera.
    """
    for tentativa in range(MAXIMO_DE_AVANCOS):
        if pagina.existe("editor_da_legenda", segundos=3.0):
            return
        if not pagina.existe("botao_avancar", segundos=SEGUNDOS_PARA_ELEMENTO):
            raise RoteiroInterrompido(
                Passo.AVANCAR, f"nao achei o botao de avancar na etapa {tentativa + 1}"
            )
        _passo(pagina.clicar, Passo.AVANCAR, "botao_avancar", segundos=SEGUNDOS_PARA_ELEMENTO)

    if not pagina.existe("editor_da_legenda", segundos=SEGUNDOS_PARA_ELEMENTO):
        raise RoteiroInterrompido(
            Passo.AVANCAR, f"a caixa da legenda nao apareceu em {MAXIMO_DE_AVANCOS} etapas"
        )


def _legenda_ficou(pagina: Pagina, legenda: str) -> bool:
    """Lê a legenda de volta. Não conseguir ler não é o mesmo que ter falhado."""
    try:
        escrito = " ".join(pagina.texto_de("editor_da_legenda").split())
        return escrito == " ".join(legenda.split())
    except Exception:  # noqa: BLE001 — vira aviso, não interrupção
        return False


def _marcar_aba(pagina: Pagina, marca: str) -> None:
    """Cola a etiqueta na aba. Falhar aqui não derruba o upload já feito."""
    try:
        pagina.marcar(marca)
    except Exception as exc:  # noqa: BLE001 — etiqueta é conveniência, não requisito
        logger.warning("[InstagramReels] nao consegui marcar a aba: %s", exc)


def _compartilhar_agora(pagina: Pagina) -> None:
    """Clica em Compartilhar e espera a CONFIRMAÇÃO aparecer (D-564).

    Esperar o compositor fechar seria esperar para sempre: medido publicando de
    verdade, ele não fecha — é substituído pelo diálogo de confirmação.

    A espera é generosa porque o Instagram só confirma depois de processar o
    vídeo do lado dele, e isso leva o tempo que levar.
    """
    _passo(pagina.clicar, Passo.PUBLICAR, "botao_compartilhar", segundos=SEGUNDOS_PARA_ELEMENTO)

    limite = time.monotonic() + SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO
    while time.monotonic() < limite:
        if publicou(pagina.existe("confirmacao_de_envio", segundos=1.0)):
            logger.info("[InstagramReels] compartilhado sozinho")
            _fechar_confirmacao(pagina)
            return
        time.sleep(INTERVALO_DA_VIGILIA)
    raise RoteiroInterrompido(
        Passo.PUBLICAR,
        f"nao vi a confirmacao em {int(SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO)}s",
    )


def _fechar_confirmacao(pagina: Pagina) -> None:
    """Dá o "Concluir". Best-effort: deixar a confirmação aberta não perde nada,
    só empilharia diálogos no item seguinte do lote."""
    try:
        if pagina.existe("botao_concluir", segundos=3.0):
            pagina.clicar("botao_concluir", segundos=5.0)
    except Exception as exc:  # noqa: BLE001
        logger.debug("[InstagramReels] confirmacao continuou aberta: %s", exc)


def _passo(funcao, passo: Passo, *args, **kwargs) -> None:
    """Roda um verbo da página traduzindo qualquer falha para o passo."""
    try:
        funcao(*args, **kwargs)
    except RoteiroInterrompido:
        raise
    except Exception as exc:  # noqa: BLE001 — a origem varia, o destino não
        raise RoteiroInterrompido(passo, f"{type(exc).__name__}: {exc}") from exc


def perfil_do_chrome() -> Path:
    """Onde mora a sessão do Instagram deste canal."""
    return perfil_do_canal(PERFIL)


def _assistir(video: Path, legenda: str, marca: str, publicar_sozinho: bool) -> dict:
    """Tudo o que fala Playwright, num thread só (síncrono por causa da D-369)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RoteiroInterrompido(
            Passo.ABRIR, "o Playwright nao esta instalado; rode `pip install playwright`"
        ) from exc

    perfil = perfil_do_chrome()
    try:
        abriu_agora = garantir_chrome(perfil, URL_INICIAL)
    except NavegadorIndisponivel as exc:
        raise RoteiroInterrompido(Passo.ABRIR, str(exc)) from exc

    pw = sync_playwright().start()
    try:
        navegador = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{porta_do_chrome(perfil)}")
        contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
        page = contexto.new_page()
        relatorio = executar_roteiro(
            PaginaDoPlaywright(page, SELETORES, escapar_apos_escrever=False),
            video=video,
            legenda=legenda,
            marca=marca,
            publicar_sozinho=publicar_sozinho,
        )
        return {**relatorio, "chrome_aberto_agora": abriu_agora}
    finally:
        # `stop` desconecta; não fecha o Chrome, que é um processo à parte.
        pw.stop()


def _vigiar_publicacao(segundos: float, marca: str) -> bool:
    """Espera o operador compartilhar. Devolve `True` só quando VIU acontecer.

    E "ver" aqui é mais difícil que no TikTok. Lá a aba navega, e navegação é
    inequívoca. Aqui o que aparece é um diálogo de confirmação no lugar do
    compositor — sinal positivo, e o único que separa publicar de descartar.

    Devolver `False` significa "não sei", e mantém o botão "publiquei" à mão.
    Errar para menos custa um clique; errar para mais apaga o MP4 (D-512).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False

    pw = sync_playwright().start()
    try:
        navegador = pw.chromium.connect_over_cdp(
            f"http://127.0.0.1:{porta_do_chrome(perfil_do_chrome())}"
        )
        contexto = navegador.contexts[0] if navegador.contexts else None
        if contexto is None:
            return False

        alvo = aba_marcada(contexto, marca, "instagram.com")
        if alvo is None:
            return False

        pagina = PaginaDoPlaywright(alvo, SELETORES, escapar_apos_escrever=False)
        limite = time.monotonic() + segundos
        while time.monotonic() < limite:
            if alvo.is_closed():
                logger.info("[InstagramReels] a aba foi fechada; nao da para saber se publicou")
                return False
            if publicou(pagina.existe("confirmacao_de_envio", segundos=1.0)):
                logger.info("[InstagramReels] confirmacao vista; o reel saiu")
                _fechar_confirmacao(pagina)
                return True
            if not pagina.existe("dialogo", segundos=1.0):
                # Nem compositor nem confirmação: ele descartou, ou fechou tudo.
                # Sem confirmação não há publicação para declarar.
                logger.info("[InstagramReels] o compositor sumiu sem confirmar; nao marco nada")
                return False
            time.sleep(INTERVALO_DA_VIGILIA)
        logger.info("[InstagramReels] %ss sem compartilhar; encerrando a vigilia", int(segundos))
        return False
    except Exception as exc:  # noqa: BLE001 — vigília nunca derruba nada
        logger.info("[InstagramReels] vigilia interrompida: %s", exc)
        return False
    finally:
        pw.stop()


async def subir_assistido(
    *,
    video: Path,
    legenda: str,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Deixa o Reel pronto no compositor, para o operador conferir e compartilhar."""
    if not video.is_file():
        raise RoteiroInterrompido(Passo.ARQUIVO, "o MP4 do pacote nao esta em disco")

    logger.info("[InstagramReels] subindo %s", video.name)
    return await asyncio.to_thread(_assistir, video, legenda, marca, publicar_sozinho)


async def aguardar_publicacao(*, segundos: float = SEGUNDOS_DE_VIGILIA, marca: str = "") -> bool:
    """Espera o operador clicar em Compartilhar, sem prender a requisição HTTP."""
    return await asyncio.to_thread(_vigiar_publicacao, segundos, marca)

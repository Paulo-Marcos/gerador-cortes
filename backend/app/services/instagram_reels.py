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

## A capa, MEDIDA em 13/09/2026 (D-589)

Mora na etapa do meio ("Editar"), num bloco "Foto da capa". Duas surpresas,
nos dois sentidos:

5. **Não há modal nem "Salvar"**, ao contrário do TikTok. A imagem entregue ao
   `<input type=file>` escondido vale na hora, e sobrevive até a legenda.
6. **A tira de quadros NÃO muda** com a capa nova — quem muda é o preview
   grande. E ele já mostra um blob ANTES (um quadro do vídeo), então a prova é
   o blob ter mudado, não ele existir.

## O recorte, MEDIDO em 13/09/2026 (D-592)

7. **A etapa "Cortar" abre em 1:1.** Um short 9:16 recortado em quadrado perdia
   quase metade da altura, sem ninguém ter pedido. O ícone "Selecionar corte"
   abre Original, 1:1, 9:16 e 16:9; o roteiro escolhe Original e confere que a
   janela de recorte ficou vertical (510x510 → 287x510) antes de avançar.

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
import threading
import time
from pathlib import Path

from app.domain.publicacao.instagram_reels import (
    Passo,
    RoteiroInterrompido,
    descricao_do_progresso,
    pede_login,
    publicou,
    recorte_vertical,
)
from app.services.navegador_assistido import (
    ChromeNaoAbriu,
    Pagina,
    PaginaDoPlaywright,
    PlaywrightAusente,
    aba_marcada,
    perfil_do_canal,
    sessao_no_chrome,
    vigiar_aba,
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
# O menu da conta profissional abre na hora (MEDIDO); curta porque conta
# pessoal nao tem menu e paga esta espera inteira.
SEGUNDOS_PARA_MENU_DE_CRIAR = 3.0
# D-589: quanto cada etapa espera o campo da capa aparecer. Curta porque so uma
# etapa tem o campo, e o `existe` da legenda que vem antes ja deu tempo de a
# etapa renderizar. O preview, MEDIDO, troca em ~0,06s; os 10s sao folga.
SEGUNDOS_PARA_ETAPA_DA_CAPA = 3.0
SEGUNDOS_PARA_CAPA = 10.0
INTERVALO_DA_CAPA = 0.25
# D-592: a janela de recorte muda na hora (MEDIDO); os 5s sao folga.
SEGUNDOS_PARA_RECORTE = 5.0
INTERVALO_DO_RECORTE = 0.25
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
    # MEDIDO em 16/09/2026, depois de a conta virar profissional (criador): o
    # "Novo post" abre um menu Postar / Video ao vivo / Anuncio. A ancora e o
    # `a[role=link]` que envolve o icone — o elemento clicavel, pelo mesmo
    # motivo do `botao_criar`. "Post" e rede do ingles, NAO medida.
    "opcao_postar": (
        'a[role="link"]:has(svg[aria-label="Postar"]), a[role="link"]:has(svg[aria-label="Post"])'
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
    # D-592, MEDIDOS em 13/09/2026 na etapa "Cortar", com um short real de PROD.
    # Ela abre em 1:1 — e um 9:16 recortado em quadrado perde quase metade da
    # altura.
    #
    # O gatilho do menu e o proprio `<svg>`: clicar no `div[role=button]` que o
    # contem NAO abriu o menu (medido). As opcoes trazem a proporcao num span, e
    # esses textos nao passam pela traducao; o aria do icone passa, e "Select
    # crop" e a rede do ingles, NAO medida (a conta e em portugues).
    "botao_do_recorte": (
        'div[role="dialog"] svg[aria-label="Selecionar corte"], '
        'div[role="dialog"] svg[aria-label="Select crop"]'
    ),
    "recorte_original": 'div[role="dialog"] span:text-is("Original")',
    # A prova: a DIV que recorta o video — a avo do `<video>` — escreve largura
    # e altura no `style` inline: 510x510 em 1:1, 287x510 em Original.
    "janela_do_recorte": 'div[role="dialog"] div:has(> div > video)',
    # D-589, MEDIDOS em 13/09/2026 na etapa "Editar". O "Selecionar do
    # computador" e fachada deste input escondido, como no TikTok: entregar a
    # imagem a ele basta. So existe um input de imagem no compositor, e so ali.
    #
    # Sem variante pt/en de proposito: nenhum dos dois ancora em texto. O
    # `accept` e do formulario e o `style` e do React — nenhum passa pela
    # traducao. E CSS puro, porque o arquivo vai por CDP (D-544).
    "campo_da_capa": 'div[role="dialog"] input[type="file"][accept*="image"]',
    # A prova da troca: a DIV irma do `<video>` do preview, cuja
    # `background-image` e a capa em blob. Ela ja existe ANTES da capa, com um
    # quadro do video — o que conta e o blob mudar (ver o topo do modulo).
    "miniatura_da_capa": 'div[role="dialog"] video + div[style*="background-image"]',
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
    capa: Path | None = None,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Abre o compositor, sobe o Reel, põe a capa, escreve a legenda — e para no
    Compartilhar.

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
    _escolher_postar_no_menu(pagina)
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

    _manter_video_inteiro(pagina)
    feitos.append(Passo.RECORTE)

    capa_em_disco = capa if capa and capa.is_file() else None
    if capa and not capa_em_disco:
        avisos.append("A capa nao esta mais em disco; o Instagram vai usar um quadro do video.")

    erro_da_capa = _avancar_ate_a_legenda(pagina, capa_em_disco)
    feitos.append(Passo.AVANCAR)
    if capa_em_disco and erro_da_capa:
        # Passo opcional, como no TikTok: o video ja subiu. Derrubar o Reel por
        # causa da capa trocaria um contratempo por um retrabalho.
        avisos.append(
            f"{erro_da_capa} Volte pela seta ate a etapa Editar e troque a capa antes "
            f"de compartilhar; o arquivo esta em {capa_em_disco}."
        )
        logger.warning("[InstagramReels] capa nao entrou: %s", erro_da_capa)
    elif capa_em_disco:
        feitos.append(Passo.CAPA)

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
        "capa_aplicada": Passo.CAPA in feitos,
        "avisos": avisos,
        "publicado": publicado,
    }


def _escolher_postar_no_menu(pagina: Pagina) -> None:
    """Escolhe "Postar" quando o "Novo post" abre um menu, e não o compositor.

    MEDIDO em 16/09/2026: em conta PROFISSIONAL o "Novo post" vira "Criar" e
    abre Postar / Vídeo ao vivo / Anúncio. Conta pessoal vai direto ao
    compositor, então o menu é condicional — não achá-lo é o caso de lá.
    """
    if pagina.existe("opcao_postar", segundos=SEGUNDOS_PARA_MENU_DE_CRIAR):
        _passo(pagina.clicar, Passo.COMPOSITOR, "opcao_postar", segundos=SEGUNDOS_PARA_ELEMENTO)
        logger.info("[InstagramReels] menu de criar da conta profissional: Postar")


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


def _manter_video_inteiro(pagina: Pagina) -> None:
    """Troca o recorte para Original e confere que a janela ficou vertical (D-592).

    Obrigatório, e não best-effort como a capa: um Reel recortado em quadrado é
    um post com metade do vídeo, e com o "publicar sozinho" ligado ele iria ao
    ar assim. Parar aqui entrega o modal aberto justamente na etapa a corrigir.

    Original, e não 9:16: para um short as duas dão a mesma janela (medido), e
    só a Original nunca corta nada se um arquivo sair fora da proporção.
    """
    if not pagina.existe("janela_do_recorte", segundos=SEGUNDOS_PARA_ELEMENTO):
        raise RoteiroInterrompido(Passo.RECORTE, "a etapa de recorte nao apareceu")
    if _recorte_ficou_vertical(pagina):
        return

    _passo(pagina.clicar, Passo.RECORTE, "botao_do_recorte", segundos=SEGUNDOS_PARA_ELEMENTO)
    _passo(pagina.clicar, Passo.RECORTE, "recorte_original", segundos=SEGUNDOS_PARA_ELEMENTO)

    limite = time.monotonic() + SEGUNDOS_PARA_RECORTE
    while not _recorte_ficou_vertical(pagina):
        if time.monotonic() >= limite:
            raise RoteiroInterrompido(
                Passo.RECORTE, "escolhi Original e a janela de recorte continuou quadrada"
            )
        time.sleep(INTERVALO_DO_RECORTE)

    logger.info("[InstagramReels] recorte em Original")
    _fechar_menu_do_recorte(pagina)


def _recorte_ficou_vertical(pagina: Pagina) -> bool:
    try:
        return recorte_vertical(pagina.atributo_de("janela_do_recorte", "style"))
    except Exception:  # noqa: BLE001 — sem leitura não dá para afirmar que ficou
        return False


def _fechar_menu_do_recorte(pagina: Pagina) -> None:
    """MEDIDO: o menu continua aberto depois da escolha. Fechar é best-effort."""
    try:
        if pagina.existe("recorte_original", segundos=1.0):
            pagina.clicar("botao_do_recorte", segundos=5.0)
    except Exception as exc:  # noqa: BLE001 — menu aberto não estraga o recorte
        logger.debug("[InstagramReels] menu do recorte continuou aberto: %s", exc)


def _avancar_ate_a_legenda(pagina: Pagina, capa: Path | None = None) -> str:
    """Clica em Avançar até a caixa da legenda aparecer — e põe a capa no caminho.

    Contar cliques seria acertar a versão de hoje: as etapas intermediárias do
    compositor (recorte, filtros) vêm e vão. O que não muda é o DESTINO — a
    caixa da legenda —, então é por ela que a gente espera.

    A capa (D-589) entra DURANTE a travessia porque mora na etapa "Editar", que
    só existe entre o recorte e a legenda. E a etapa certa é reconhecida pelo
    campo da capa aparecer, e não pela posição — pelo mesmo motivo acima.

    Devolve o motivo de a capa não ter entrado, ou "" (entrou, ou não havia).
    """
    erro_da_capa = "Nao achei a etapa da capa no compositor." if capa else ""
    pendente = capa
    for tentativa in range(MAXIMO_DE_AVANCOS):
        if pagina.existe("editor_da_legenda", segundos=3.0):
            return erro_da_capa
        if pendente and pagina.existe(
            "campo_da_capa", segundos=SEGUNDOS_PARA_ETAPA_DA_CAPA, visivel=False
        ):
            erro_da_capa = _tentar_capa(pagina, pendente)
            pendente = None
        if not pagina.existe("botao_avancar", segundos=SEGUNDOS_PARA_ELEMENTO):
            raise RoteiroInterrompido(
                Passo.AVANCAR, f"nao achei o botao de avancar na etapa {tentativa + 1}"
            )
        _passo(pagina.clicar, Passo.AVANCAR, "botao_avancar", segundos=SEGUNDOS_PARA_ELEMENTO)

    if not pagina.existe("editor_da_legenda", segundos=SEGUNDOS_PARA_ELEMENTO):
        raise RoteiroInterrompido(
            Passo.AVANCAR, f"a caixa da legenda nao apareceu em {MAXIMO_DE_AVANCOS} etapas"
        )
    return erro_da_capa


def _tentar_capa(pagina: Pagina, capa: Path) -> str:
    """Troca a capa, devolvendo o motivo quando não dá — e nunca levantando.

    O irmão do `_tentar_capa` do TikTok, mais curto por uma diferença MEDIDA em
    13/09/2026: aqui não há modal nem "Salvar", a imagem entregue ao input vale
    na hora.

    A desconfiança é a mesma: entregar sem erro prova só que o input aceitou. A
    prova é o blob do preview MUDAR — e ele sempre tem um, o quadro do vídeo.
    """
    try:
        if not pagina.existe("miniatura_da_capa", segundos=SEGUNDOS_PARA_CAPA):
            return "Achei a etapa da capa, mas nao o preview para conferir a troca."
        antes = _miniatura_da_capa(pagina)

        pagina.enviar_arquivo("campo_da_capa", capa, segundos=SEGUNDOS_PARA_CAPA)
        if not antes:
            return "Entreguei a capa, mas nao consegui ler o preview para conferir."

        limite = time.monotonic() + SEGUNDOS_PARA_CAPA
        while time.monotonic() < limite:
            if _miniatura_da_capa(pagina) not in ("", antes):
                logger.info("[InstagramReels] capa aplicada")
                return ""
            time.sleep(INTERVALO_DA_CAPA)
        return "Entreguei a capa, mas o preview continua com o quadro do video."
    except Exception as exc:  # noqa: BLE001 — qualquer falha aqui vira aviso
        return f"{type(exc).__name__}: {exc}"


def _miniatura_da_capa(pagina: Pagina) -> str:
    """O `style` do preview — onde mora o blob da capa —, ou vazio."""
    try:
        return pagina.atributo_de("miniatura_da_capa", "style")
    except Exception:  # noqa: BLE001 — sem leitura a comparação é inconclusiva
        return ""


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


def _assistir(
    video: Path, legenda: str, capa: Path | None, marca: str, publicar_sozinho: bool
) -> dict:
    """Tudo o que fala Playwright, num thread só (síncrono por causa da D-369)."""
    try:
        with sessao_no_chrome(perfil_do_chrome(), abrir_em=URL_INICIAL) as (
            navegador,
            abriu_agora,
        ):
            contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
            page = contexto.new_page()
            relatorio = executar_roteiro(
                PaginaDoPlaywright(page, SELETORES, escapar_apos_escrever=False),
                video=video,
                legenda=legenda,
                capa=capa,
                marca=marca,
                publicar_sozinho=publicar_sozinho,
            )
            return {**relatorio, "chrome_aberto_agora": abriu_agora}
    except (PlaywrightAusente, ChromeNaoAbriu) as exc:
        raise RoteiroInterrompido(Passo.ABRIR, str(exc)) from exc


def _vigiar_publicacao(segundos: float, marca: str, parar: threading.Event | None = None) -> bool:
    """Espera o operador compartilhar. Devolve `True` só quando VIU acontecer.

    E "ver" aqui é mais difícil que no TikTok. Lá a aba navega, e navegação é
    inequívoca. Aqui o que aparece é um diálogo de confirmação no lugar do
    compositor — sinal positivo, e o único que separa publicar de descartar.

    Devolver `False` significa "não sei", e mantém o botão "publiquei" à mão.
    Errar para menos custa um clique; errar para mais apaga o MP4 (D-512).
    """
    try:
        with sessao_no_chrome(perfil_do_chrome()) as (navegador, _):
            contexto = navegador.contexts[0] if navegador.contexts else None
            if contexto is None:
                return False

            alvo = aba_marcada(contexto, marca, "instagram.com")
            if alvo is None:
                return False

            pagina = PaginaDoPlaywright(alvo, SELETORES, escapar_apos_escrever=False)

            def conferir() -> bool | None:
                if publicou(pagina.existe("confirmacao_de_envio", segundos=1.0)):
                    logger.info("[InstagramReels] confirmacao vista; o reel saiu")
                    _fechar_confirmacao(pagina)
                    return True
                if not pagina.existe("dialogo", segundos=1.0):
                    # Nem compositor nem confirmação: ele descartou, ou fechou tudo.
                    # Sem confirmação não há publicação para declarar.
                    logger.info("[InstagramReels] o compositor sumiu sem confirmar; nao marco nada")
                    return False
                return None

            return vigiar_aba(
                alvo,
                segundos,
                parar,
                conferir,
                rotulo="[InstagramReels]",
                verbo="compartilhar",
                intervalo=INTERVALO_DA_VIGILIA,
            )
    except PlaywrightAusente:
        return False
    except Exception as exc:  # noqa: BLE001 — vigília nunca derruba nada
        logger.info("[InstagramReels] vigilia interrompida: %s", exc)
        return False


async def subir_assistido(
    *,
    video: Path,
    legenda: str,
    capa: Path | None = None,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Deixa o Reel pronto no compositor, para o operador conferir e compartilhar."""
    if not video.is_file():
        raise RoteiroInterrompido(Passo.ARQUIVO, "o MP4 do pacote nao esta em disco")

    logger.info("[InstagramReels] subindo %s", video.name)
    return await asyncio.to_thread(_assistir, video, legenda, capa, marca, publicar_sozinho)


async def aguardar_publicacao(
    *,
    segundos: float = SEGUNDOS_DE_VIGILIA,
    marca: str = "",
    parar: threading.Event | None = None,
) -> bool:
    """Espera o operador clicar em Compartilhar, sem prender a requisição HTTP.

    `parar` encerra a espera antes do tempo (D-591): o lote cancelado, ou o
    "publiquei" do operador.
    """
    return await asyncio.to_thread(_vigiar_publicacao, segundos, marca, parar)

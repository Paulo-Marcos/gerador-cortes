"""Upload assistido no TikTok Studio, por automação de navegador (D-537).

## O que este módulo é, em uma frase

O braço que executa o roteiro de `domain/publicacao/tiktok_studio.py`: abre o Chrome do
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
import logging
import re
import threading
import time
from pathlib import Path

from app.domain.compartilhado.time_convert import seg_to_duracao_humana
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.tiktok_studio import (
    PORTA_MINIMA_DE_DEPURACAO,
    Passo,
    RoteiroInterrompido,
    descricao_do_progresso,
    leitura_do_envio,
    marco_do_envio,
)
from app.services.navegador_assistido import (
    ChromeNaoAbriu,
    Pagina,
    PaginaDoPlaywright,
    PlaywrightAusente,
    aba_marcada,
    apagar_copias_do_upload,
    perfil_do_canal,
    sessao_no_chrome,
    vigiar_aba,
)

logger = logging.getLogger(__name__)

URL_DO_UPLOAD = "https://www.tiktok.com/tiktokstudio/upload?from=upload"
ORIGEM_DO_TIKTOK = "https://www.tiktok.com"
TRECHO_DA_ABA_DE_UPLOAD = "tiktokstudio/upload"

# Porta do protocolo de depuração do Chrome. Alta e PREVISÍVEL para reaproveitar
# a janela já aberta entre um corte e o seguinte — mas previsível POR PERFIL, e
# não uma só para a máquina inteira.
#
# D-564: era 9222 fixo, e isso encostou DEV em PROD. O backend de desenvolvimento
# achou um Chrome vivo na porta, concluiu "já tem um aberto" e conectou — só que
# aquele Chrome era o de produção, com a conta real logada. A porta era um nome
# global, e nome global casa com quem chegar primeiro. Agora cada perfil tem a
# sua, derivada do caminho absoluto (a mesma âncora da D-370).
PORTA_DE_DEPURACAO = PORTA_MINIMA_DE_DEPURACAO

# A pasta da sessao do TikTok dentro do canal ativo. O nome vira subpasta: a
# sessao do Instagram mora ao lado, e nunca dentro desta.
PERFIL = "tiktok"


def perfil_do_chrome() -> Path:
    """Onde mora a sessao do TikTok deste canal."""
    return perfil_do_canal(PERFIL)


# Quanto esperamos em cada passo. O processamento é o único generoso: um corte
# horizontal de meia hora leva minutos, e desistir no meio deixaria o operador
# com um upload órfão que ele nem sabe que existe.
SEGUNDOS_PARA_ABRIR = 45.0
SEGUNDOS_PARA_SESSAO = 20.0
SEGUNDOS_PARA_ELEMENTO = 30.0
SEGUNDOS_PARA_CAPA = 20.0
SEGUNDOS_PARA_TUTORIAL = 8.0
SEGUNDOS_PARA_PROCESSAR = 900.0
SEGUNDOS_PARA_AGENDAR = 15.0

# O acompanhamento do envio le o cartao de status de meio em meio segundo. E
# desiste de acompanhar depois de dez segundos sem ver percentual: o cartao
# MEDIDO fica sem numero por ~1,5s antes de comecar, e sem numero por mais que
# isso so se o TikTok tiver mudado o cartao — ai o log fica mudo, e a espera que
# decide segue sozinha.
INTERVALO_DO_ENVIO = 0.5
LEITURAS_SEM_PERCENTUAL = 20

# Quantas vezes viramos o mes procurando o dia pedido. Um basta: a janela de
# agendamento do TikTok e curta, e um alvo que nao apareceu depois de virar uma
# vez esta fora dela — insistir so trocaria "fora da janela" por "demorou".
MESES_A_VIRAR = 1

# Quantas vezes reabrimos o relogio ate ele parar no minuto pedido.
#
# MEDIDO em 12/09/2026 contra a pagina real: o seletor de hora e uma LISTA QUE
# ROLA, e ao abrir ela se anima ate o valor atual. Um clique que chega durante a
# animacao acerta o vizinho — pedi 00:05 e o campo ficou 00:25, quatro posicoes
# adiante. Na segunda passada a lista ja esta parada e o clique cai onde deve.
#
# Tres tentativas e folga para isso; mais que isso nao seria lentidao, seria
# outro problema — e ai a falha tem de aparecer.
TENTATIVAS_DO_RELOGIO = 3

# Quanto tempo ficamos de olho na aba esperando o operador publicar, e de quanto
# em quanto. Meia hora cobre revisar com calma e ir buscar um cafe; passar disso
# seria manter uma conexao CDP viva por nada. Tres segundos de intervalo porque
# a unica coisa que se le e a URL — custa nada e nao ha pressa de milissegundo.
SEGUNDOS_DE_VIGILIA = 1800.0
INTERVALO_DA_VIGILIA = 3.0

# D-564: quanto esperamos a pagina sair do upload depois de NOS clicarmos em
# Publicar. Curto de proposito: aqui nao ha humano pensando, so a plataforma
# processando o post — se em dois minutos ela nao navegou, algo a barrou.
SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO = 120.0


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
    # D-580, MEDIDOS em 11/09/2026 — e mais dois palpites mortos para a lista:
    #
    # 4. O rotulo NAO e "Agendar": e "Programar". Procurar pelo texto obvio nao
    #    achava nada. Por isso a ancora aqui e o `value` do radio, que e do
    #    formulario e nao da traducao.
    # 5. O campo da HORA vem ANTES do de data no DOM, ao contrario do que a
    #    leitura da tela sugere. Trocar os dois preencheria data no seletor de
    #    hora, em silencio.
    #
    # Os dois campos sao `readonly`: nao ha o que digitar, so o que clicar.
    "ligar_agendamento": '[data-e2e="schedule_container"] label:has(input[value="schedule"])',
    "agendamento_ligado": '[data-e2e="schedule_container"] input[value="schedule"]:checked',
    "campo_da_hora": ':nth-match([data-e2e="schedule_container"] input.TUXTextInputCore-input, 1)',
    "campo_da_data": ':nth-match([data-e2e="schedule_container"] input.TUXTextInputCore-input, 2)',
    # So os dias DENTRO da janela de agendamento tem `valid`. Os de fora — e os
    # do mes vizinho que aparecem na mesma grade — ficam sem a classe, entao
    # pedir `.valid` ja e pedir "um dia que da para escolher".
    "dia_do_calendario": ".calendar-wrapper .day-span-container .day.valid",
    "mes_seguinte": ":nth-match(.calendar-wrapper .arrow, 2)",
    # O seletor de hora vive no DOM o tempo todo, invisivel. Sem o `:not(...)`
    # o robo clicaria numa opcao escondida e ficaria esperando um efeito que
    # nunca vem.
    "hora_do_seletor": (
        ".tiktok-timepicker-time-picker-container:not(.tiktok-timepicker-invisible) "
        ".tiktok-timepicker-option-text.tiktok-timepicker-left"
    ),
    "minuto_do_seletor": (
        ".tiktok-timepicker-time-picker-container:not(.tiktok-timepicker-invisible) "
        ".tiktok-timepicker-option-text.tiktok-timepicker-right"
    ),
}

# O texto que o cartão de status mostra quando o arquivo terminou de subir.
# Esperar por ELE, e não só pelo botão de publicar acender, é o que impede
# devolver a aba no meio do upload de um corte de 300 MB.
ENVIO_CONCLUIDO = r"enviad|carregad|uploaded"


def executar_roteiro(
    pagina: Pagina,
    *,
    video: Path,
    legenda: str,
    capa: Path | None,
    marca: str = "",
    publicar_sozinho: bool = False,
    agendamento: Agendamento | None = None,
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

    from app.domain.publicacao.tiktok_studio import pede_login

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
    _acompanhar_envio(pagina)
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

    # D-580. Depois da capa e ANTES da revisao, por dois motivos: o formulario
    # de agendamento so existe com o video ja aceito, e a revisao e o momento em
    # que o operador confere — entao o que ele confere tem de ja incluir a data.
    if agendamento:
        _agendar(pagina, agendamento)
        feitos.append(Passo.AGENDAMENTO)

    feitos.append(Passo.REVISAO)

    # D-564: a etiqueta na aba, antes de qualquer coisa que possa navegar. E o
    # que permite a vigilia reencontrar ESTA aba depois — inclusive quando o
    # lote tem outra aberta.
    if marca:
        _marcar_aba(pagina, marca)

    publicado = False
    if publicar_sozinho:
        _publicar_agora(pagina)
        feitos.append(Passo.PUBLICAR)
        publicado = True

    return {
        "passos": [p.value for p in feitos],
        "resumo": descricao_do_progresso(feitos),
        "capa_aplicada": Passo.CAPA in feitos,
        "agendado_para": agendamento.legivel() if agendamento else "",
        "avisos": avisos,
        "publicado": publicado,
    }


def _agendar(pagina: Pagina, agendamento: Agendamento) -> None:
    """Liga o Programar e marca dia e hora — conferindo cada um.

    Conferir nao e zelo excessivo: os dois campos sao `readonly` e so mudam por
    clique num seletor. Um clique que erra o alvo NAO da erro — ele acerta outra
    coisa. Sem ler o que ficou no campo, o robo entregaria a aba com uma data
    qualquer e a certeza de ter feito o pedido.
    """
    if not pagina.existe("agendamento_ligado", segundos=1.0, visivel=False):
        pagina.clicar("ligar_agendamento", segundos=SEGUNDOS_PARA_AGENDAR)
    if not pagina.existe("agendamento_ligado", segundos=SEGUNDOS_PARA_AGENDAR, visivel=False):
        raise RoteiroInterrompido(Passo.AGENDAMENTO, "o Programar nao ligou")

    _marcar_dia(pagina, agendamento)
    _marcar_hora(pagina, agendamento)
    logger.info("[TikTokStudio] agendado para %s", agendamento.legivel())


def _marcar_dia(pagina: Pagina, agendamento: Agendamento) -> None:
    """Abre o calendario e clica o dia — virando o mes se ele nao estiver a vista."""
    pagina.clicar("campo_da_data", segundos=SEGUNDOS_PARA_AGENDAR)

    for tentativa in range(MESES_A_VIRAR + 1):
        if pagina.clicar_opcao("dia_do_calendario", agendamento.dia(), segundos=3.0):
            break
        if tentativa < MESES_A_VIRAR:
            pagina.clicar("mes_seguinte", segundos=SEGUNDOS_PARA_AGENDAR)
    else:
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO,
            f"o dia {agendamento.dia()} nao esta selecionavel no calendario; "
            "o TikTok so agenda dentro de uma janela curta",
        )

    if pagina.valor_de("campo_da_data") == agendamento.data_iso():
        return

    # Segunda chance pelo mesmo motivo do relogio: a grade pode ter se
    # redesenhado sob o cursor. Com ela ja parada, o clique cai onde deve.
    pagina.clicar("campo_da_data", segundos=SEGUNDOS_PARA_AGENDAR)
    pagina.clicar_opcao("dia_do_calendario", agendamento.dia(), segundos=3.0)

    escrito = pagina.valor_de("campo_da_data")
    if escrito != agendamento.data_iso():
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO, f"pedi {agendamento.data_iso()} e o campo ficou {escrito!r}"
        )


def _marcar_hora(pagina: Pagina, agendamento: Agendamento) -> None:
    """Escolhe hora e minuto nas duas colunas do seletor.

    Reabrir o seletor entre uma coluna e outra e deliberado: escolher a hora
    pode fecha-lo, e um segundo clique no campo custa nada e e idempotente —
    bem mais barato que descobrir na producao que o minuto nunca entrou.
    """
    alvo = f"{agendamento.hora()}:{agendamento.minuto()}"
    achou = False

    for _ in range(TENTATIVAS_DO_RELOGIO):
        pagina.clicar("campo_da_hora", segundos=SEGUNDOS_PARA_AGENDAR)
        hora_ok = pagina.clicar_opcao("hora_do_seletor", agendamento.hora(), segundos=5.0)
        minuto_ok = pagina.clicar_opcao("minuto_do_seletor", agendamento.minuto(), segundos=5.0)
        achou = achou or (hora_ok and minuto_ok)

        if pagina.valor_de("campo_da_hora") == alvo:
            return

    escrito = pagina.valor_de("campo_da_hora")
    if not achou:
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO, f"nao achei {alvo} nas colunas do seletor de hora"
        )
    raise RoteiroInterrompido(
        Passo.AGENDAMENTO,
        f"pedi {alvo} e o campo ficou {escrito!r} depois de {TENTATIVAS_DO_RELOGIO} tentativas",
    )


def _marcar_aba(pagina: Pagina, marca: str) -> None:
    """Cola a etiqueta na aba. Falhar aqui NAO derruba o upload ja feito.

    Sem a marca a vigilia cai no criterio antigo ("a aba que esta em /upload"),
    que e pior mas nao e o fim do mundo: o operador ainda tem o botao
    "publiquei". Perder um upload de 300 MB por causa de um `window.name` seria
    trocar o principal pelo acessorio.
    """
    try:
        pagina.marcar(marca)
    except Exception as exc:  # noqa: BLE001 — etiqueta e conveniencia, nao requisito
        logger.warning("[TikTokStudio] nao consegui marcar a aba: %s", exc)


def _publicar_agora(pagina: Pagina) -> None:
    """Clica em Publicar e ESPERA a pagina sair do upload (D-564).

    So roda com o interruptor ligado pelo operador. O clique sozinho nao prova
    nada — o TikTok pode recusar com um aviso na propria pagina e ficar onde
    esta. A prova e a NAVEGACAO: ao publicar, ele leva a aba para a lista de
    publicacoes (a mesma assimetria que a `publicou` do dominio explora).
    """
    from app.domain.publicacao.tiktok_studio import publicou

    _passo(pagina.clicar, Passo.PUBLICAR, "botao_publicar", segundos=SEGUNDOS_PARA_ELEMENTO)

    limite = time.monotonic() + SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO
    while time.monotonic() < limite:
        if publicou(pagina.url_atual()):
            logger.info("[TikTokStudio] publicado sozinho")
            return
        time.sleep(INTERVALO_DA_VIGILIA)
    raise RoteiroInterrompido(
        Passo.PUBLICAR, f"a pagina nao saiu do upload em {int(SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO)}s"
    )


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


def _acompanhar_envio(pagina: Pagina) -> None:
    """Conta no log o percentual do envio, lendo o cartao de status. Nunca decide.

    O operador acompanha o upload pelo console; sem isto, um corte de 300 MB
    ficava minutos numa linha so ("subindo video.mp4") e parecia travado.

    Quem decide se o envio terminou continua sendo o `esperar_texto` logo depois:
    se o TikTok mudar o cartao, este acompanhamento para de falar e o roteiro
    segue exatamente como antes.
    """
    if not pagina.existe("status_do_upload", segundos=SEGUNDOS_PARA_ELEMENTO, visivel=False):
        return
    inicio = time.monotonic()
    ultimo_marco = 0
    sem_percentual = 0
    while time.monotonic() - inicio < SEGUNDOS_PARA_PROCESSAR:
        texto = _ler_status_do_envio(pagina)
        if re.search(ENVIO_CONCLUIDO, texto, re.IGNORECASE):
            decorrido = seg_to_duracao_humana(time.monotonic() - inicio)
            logger.info("[TikTokStudio] envio concluido em %s", decorrido)
            return
        leitura = leitura_do_envio(texto)
        if leitura is None:
            sem_percentual += 1
            if sem_percentual > LEITURAS_SEM_PERCENTUAL:
                logger.debug("[TikTokStudio] cartao de status sem percentual; paro de acompanhar")
                return
        else:
            sem_percentual = 0
            marco = marco_do_envio(leitura.percentual, ultimo_marco)
            if marco is not None:
                ultimo_marco = marco
                logger.info(
                    "[TikTokStudio] envio %d%% (%s)", int(leitura.percentual), leitura.detalhe
                )
        time.sleep(INTERVALO_DO_ENVIO)


def _ler_status_do_envio(pagina: Pagina) -> str:
    try:
        return pagina.texto_de("status_do_upload")
    except Exception:  # noqa: BLE001 — cartao redesenhando entre duas leituras
        return ""


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


def _assistir(
    video: Path,
    legenda: str,
    capa: Path | None,
    marca: str = "",
    publicar_sozinho: bool = False,
    agendamento: Agendamento | None = None,
) -> dict:
    """Tudo o que fala Playwright, num thread só (síncrono de propósito).

    A API assíncrona do Playwright cria subprocessos pelo event loop, e no
    Windows sob uvicorn isso falha (D-369). A síncrona num thread é o padrão
    que o resto deste projeto já usa pelo mesmo motivo.
    """
    try:
        with sessao_no_chrome(perfil_do_chrome(), abrir_em=URL_DO_UPLOAD) as (
            navegador,
            abriu_agora,
        ):
            contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
            # A vigilia so apaga a copia quando VE a publicacao; o "publiquei" clicado
            # a mao escapa dela. Antes de subir o proximo, a sobra do anterior sai.
            apagar_copias_do_upload(contexto, ORIGEM_DO_TIKTOK, TRECHO_DA_ABA_DE_UPLOAD)
            page = contexto.new_page()
            relatorio = executar_roteiro(
                PaginaDoPlaywright(page, SELETORES),
                video=video,
                legenda=legenda,
                capa=capa,
                marca=marca,
                publicar_sozinho=publicar_sozinho,
                agendamento=agendamento,
            )
            return {**relatorio, "chrome_aberto_agora": abriu_agora}
    except (PlaywrightAusente, ChromeNaoAbriu) as exc:
        # A camada do navegador nao sabe em que passo estamos; o roteiro sabe.
        raise RoteiroInterrompido(Passo.ABRIR, str(exc)) from exc


def _vigiar_publicacao(
    segundos: float, marca: str = "", parar: threading.Event | None = None
) -> bool:
    """Fica de olho na aba até o operador publicar. Síncrono, para rodar em thread.

    Devolve `True` só quando VIU a publicação acontecer. Aba fechada, tempo
    esgotado ou qualquer tropeço devolvem `False` — e `False` aqui significa
    "não sei", não "não publicou". A tela mantém o botão "publiquei" justamente
    para esse caso.
    """
    from app.domain.publicacao.tiktok_studio import publicou

    try:
        with sessao_no_chrome(perfil_do_chrome()) as (navegador, _):
            contexto = navegador.contexts[0] if navegador.contexts else None
            if contexto is None:
                return False

            # D-564: a aba que ESTE item marcou. O criterio antigo — "a que esta em
            # /upload" — continua valendo quando nao ha marca (o botao avulso), mas
            # num lote ele e loteria: duas abas de upload e ele escolhe qualquer uma.
            alvo = aba_marcada(contexto, marca, "tiktokstudio/upload")
            if alvo is None:
                return False

            def conferir() -> bool | None:
                if not publicou(alvo.url):
                    return None
                logger.info("[TikTokStudio] publicacao detectada em %s", alvo.url[:60])
                if apagar_copias_do_upload(contexto, ORIGEM_DO_TIKTOK, TRECHO_DA_ABA_DE_UPLOAD):
                    logger.info("[TikTokStudio] copia do video apagada do perfil do robo")
                return True

            return vigiar_aba(
                alvo,
                segundos,
                parar,
                conferir,
                rotulo="[TikTokStudio]",
                verbo="publicar",
                intervalo=INTERVALO_DA_VIGILIA,
            )
    except PlaywrightAusente:
        return False
    except Exception as exc:  # noqa: BLE001 — vigilia nunca derruba nada
        logger.info("[TikTokStudio] vigilia interrompida: %s", exc)
        return False


async def aguardar_publicacao(
    *,
    segundos: float = SEGUNDOS_DE_VIGILIA,
    marca: str = "",
    parar: threading.Event | None = None,
) -> bool:
    """Espera o operador clicar em Publicar, sem prender a requisicao HTTP.

    `parar` encerra a espera antes do tempo (D-591) — é como o lote cancela, ou
    avisa que o operador já marcou "publiquei".
    """
    return await asyncio.to_thread(_vigiar_publicacao, segundos, marca, parar)


async def subir_assistido(
    *,
    video: Path,
    legenda: str,
    capa: Path | None = None,
    marca: str = "",
    publicar_sozinho: bool = False,
    agendamento: Agendamento | None = None,
) -> dict:
    """Deixa o post pronto para o operador conferir e publicar.

    Com `publicar_sozinho` o robô também aperta o botão — só com o interruptor
    que o operador ligou. Levanta `RoteiroInterrompido`, cuja mensagem já é a
    instrução para a tela.
    """
    if not video.is_file():
        raise RoteiroInterrompido(Passo.ARQUIVO, "o MP4 do pacote nao esta em disco")

    logger.info("[TikTokStudio] subindo %s", video.name)
    return await asyncio.to_thread(
        _assistir, video, legenda, capa, marca, publicar_sozinho, agendamento
    )

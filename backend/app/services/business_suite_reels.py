"""O robô que agenda Reels no Meta Business Suite (D-1010).

O irmão do `instagram_reels`, com a mesma forma: roteiro em intenções (`Pagina`),
seletores num lugar só e a falha que diz qual passo quebrou. Usa o MESMO perfil do
navegador dele: a conferência da conta (RN-31) continua no instagram.com, e o
operador entra no Business Suite uma vez só.

## O que foi MEDIDO em 02/11/2026, na conta do canal

1. **Não há `<input type=file>` na página.** Ele nasce no clique, então o arquivo
   é entregue interceptando o seletor por CDP. Passou com 68 MB, onde o caminho
   comum do Playwright recusa acima de 50 MB.
2. **Chegar a 100% não libera o "Next".** A Meta ainda processa o vídeo, e o botão
   habilitou de 1,6 a 11 s depois. O clique espera por ele.
3. **Há dois "Next"** quando o carrossel de miniaturas aparece. O do rodapé é o último.
4. **Há dois "Schedule":** a opção tem `aria-pressed`, e o botão final não.
5. **A data digitada só vira "Nov 9, 2026" ao sair do campo.** Antes disso ela
   aparece como "11/9/2026", então a conferência vem depois de tirar o foco.
6. **Apagar o campo de data faz ele voltar para hoje.** A data entra por cima da seleção.
7. **A hora não tem valor legível no `input`:** quem diz é `aria-valuenow`, e
   `aria-valuetext` no AM/PM.

A interface dessa conta está em inglês. As variantes em português são rede, NÃO medida.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from pathlib import Path

from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.business_suite_reels import (
    Passo,
    RoteiroInterrompido,
    agendou,
    data_para_digitar,
    descricao_do_progresso,
    hora_em_12h,
    hora_marcada,
    no_compositor,
    nome_da_conta,
    pede_login,
)
from app.domain.publicacao.conta_do_destino import Conta
from app.domain.publicacao.publicacao import pode_publicar_sozinho
from app.services import conta_do_destino, instagram_reels
from app.services.navegador_assistido import (
    ChromeNaoAbriu,
    PaginaDoPlaywright,
    PlaywrightAusente,
    aba_marcada,
    sessao_no_chrome,
    vigiar_aba,
)
from app.services.navegador_do_robo import executavel_escolhido

logger = logging.getLogger(__name__)

# Sem ids: a Meta completa a URL com a conta da sessão (medido).
URL_DO_COMPOSITOR = "https://business.facebook.com/latest/reels_composer"
DOMINIO = "business.facebook.com"
DESTINO_DA_CONTA = "instagram_business"

SEGUNDOS_PARA_ABRIR = 45.0
SEGUNDOS_PARA_SESSAO = 30.0
SEGUNDOS_PARA_ELEMENTO = 30.0
SEGUNDOS_PARA_ENVIO = 900.0
SEGUNDOS_PARA_PROCESSAR = 300.0
SEGUNDOS_PARA_CAPA = 20.0
SEGUNDOS_PARA_ACHAR_ETAPA = 3.0
SEGUNDOS_PARA_CONFIRMAR = 120.0
SEGUNDOS_DE_VIGILIA = 1800.0
SEGUNDOS_PARA_O_SELETOR = 10.0
INTERVALO_DA_VIGILIA = 3.0
INTERVALO_DA_CONFIRMACAO = 1.0
INTERVALO_DO_SELETOR_MS = 250

# Medido: duas etapas (Edit e Share). O teto é folga para a Meta acrescentar uma.
MAXIMO_DE_AVANCOS = 4

SELETORES: dict[str, str] = {
    "conta_do_compositor": '[role="combobox"][aria-haspopup="listbox"]',
    "botao_do_video": (
        '[role="button"]:has-text("Add Video"), [role="button"]:has-text("Adicionar vídeo")'
    ),
    "envio_completo": ':text-is("100%")',
    "editor_da_legenda": '[role="textbox"][contenteditable="true"]',
    "aba_da_capa": (
        '[role="button"][aria-pressed]:has-text("Upload image"), '
        '[role="button"][aria-pressed]:has-text("Carregar imagem")'
    ),
    "envio_da_capa": 'a:text-is("Upload image"), a:text-is("Carregar imagem")',
    "capa_trocada": ':text-is("Change image"), :text-is("Alterar imagem")',
    "botao_avancar": ('[role="button"]:has-text("Next"), [role="button"]:has-text("Avançar")'),
    "opcao_agendar": (
        '[role="button"][aria-pressed]:has-text("Schedule"), '
        '[role="button"][aria-pressed]:has-text("Programar")'
    ),
    "campo_da_data": 'input[placeholder="mm/dd/yyyy"]',
    "campo_da_hora": 'input[aria-label="hours"]',
    "campo_do_minuto": 'input[aria-label="minutes"]',
    "campo_do_periodo": 'input[aria-label="meridiem"]',
    # Clicar aqui só tira o foco do campo: é o que faz a data ser aceita.
    "titulo_do_agendamento": (':text-is("Scheduling options"), :text-is("Opções de programação")'),
    "botao_agendar": (
        '[role="button"]:not([aria-pressed]):has-text("Schedule"), '
        '[role="button"]:not([aria-pressed]):has-text("Programar")'
    ),
}


class PaginaDoBusinessSuite(PaginaDoPlaywright):
    """A `Pagina`, mais os três gestos que só esta tela pede."""

    def enviar_pelo_seletor(self, alvo: str, caminho: Path, *, segundos: float) -> None:
        """Clica no `alvo` e entrega o CAMINHO ao seletor que ele abre, por CDP.

        Interceptar é o que impede a janela nativa de abrir, e o caminho é o que
        evita o teto de 50 MB (ver `PaginaDoPlaywright.enviar_arquivo`).
        """
        sessao = self._page.context.new_cdp_session(self._page)
        abertos: list[dict] = []
        sessao.on("Page.fileChooserOpened", lambda evento: abertos.append(evento))
        try:
            sessao.send("Page.enable")
            sessao.send("DOM.enable")
            sessao.send("Page.setInterceptFileChooserDialog", {"enabled": True})
            self._page.locator(self._css(alvo)).last.click(timeout=segundos * 1000)
            limite = time.monotonic() + SEGUNDOS_PARA_O_SELETOR
            while not abertos and time.monotonic() < limite:
                self._page.wait_for_timeout(INTERVALO_DO_SELETOR_MS)
            if not abertos:
                raise TimeoutError(f"{alvo} nao abriu o seletor de arquivos")
            sessao.send(
                "DOM.setFileInputFiles",
                {"files": [str(caminho.resolve())], "backendNodeId": abertos[0]["backendNodeId"]},
            )
            sessao.send("Page.setInterceptFileChooserDialog", {"enabled": False})
        finally:
            sessao.detach()

    def clicar_ultimo(self, alvo: str, *, segundos: float) -> None:
        """Clica no último, e o clique espera ele habilitar (medições 2 e 3)."""
        self._page.locator(self._css(alvo)).last.click(timeout=segundos * 1000)

    def digitar(self, alvo: str, texto: str, *, segundos: float) -> None:
        """Tecla a tecla: é como os `spinbutton` de hora aceitam o valor (medido)."""
        self._page.locator(self._css(alvo)).first.click(timeout=segundos * 1000)
        self._page.keyboard.type(texto)

    def substituir(self, alvo: str, texto: str, *, segundos: float) -> None:
        """Digita POR CIMA da seleção. Apagar antes faz o campo de data voltar para hoje."""
        self._page.locator(self._css(alvo)).first.click(timeout=segundos * 1000)
        self._page.keyboard.press("Control+A")
        self._page.keyboard.insert_text(texto)

    def apertar(self, tecla: str) -> None:
        self._page.keyboard.press(tecla)


def executar_roteiro(
    pagina: PaginaDoBusinessSuite,
    *,
    video: Path,
    legenda: str,
    capa: Path | None,
    agendamento: Agendamento,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Sobe o Reel, põe legenda e capa, marca dia e hora, e para no botão de agendar.

    Com `publicar_sozinho`, clica nele (RN-26: só com a capa confirmada). Levanta
    `RoteiroInterrompido` no primeiro passo que falhar, com a aba aberta.
    """
    feitos: list[Passo] = []
    avisos: list[str] = []

    _passo(pagina.abrir, Passo.ABRIR, URL_DO_COMPOSITOR, segundos=SEGUNDOS_PARA_ABRIR)
    feitos.append(Passo.ABRIR)

    # O redirecionamento para o login chega depois do `goto`: a decisão é esperada.
    if not pagina.existe("botao_do_video", segundos=SEGUNDOS_PARA_SESSAO):
        if pede_login(pagina.url_atual()):
            raise RoteiroInterrompido(Passo.SESSAO)
        raise RoteiroInterrompido(Passo.ARQUIVO, "o criador de Reels nao carregou")
    feitos.append(Passo.SESSAO)

    _conferir_conta(pagina)
    feitos.append(Passo.CONTA)

    _passo(
        pagina.enviar_pelo_seletor,
        Passo.ARQUIVO,
        "botao_do_video",
        video,
        segundos=SEGUNDOS_PARA_ELEMENTO,
    )
    if not pagina.existe("envio_completo", segundos=SEGUNDOS_PARA_ENVIO):
        raise RoteiroInterrompido(Passo.ARQUIVO, "o envio nao chegou a 100%")
    feitos.append(Passo.ARQUIVO)

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
            "Escrevi a legenda mas nao consegui confirmar que ela ficou. Confira na aba "
            "antes de agendar."
        )

    _aplicar_capa(pagina, capa, feitos, avisos)

    _avancar_ate_o_agendamento(pagina)
    feitos.append(Passo.AVANCAR)

    _marcar_data_e_hora(pagina, agendamento)
    feitos.append(Passo.AGENDAMENTO)

    _passo(
        pagina.esperar_habilitado, Passo.REVISAO, "botao_agendar", segundos=SEGUNDOS_PARA_ELEMENTO
    )
    feitos.append(Passo.REVISAO)

    if marca:
        try:
            pagina.marcar(marca)
        except Exception as exc:  # noqa: BLE001 — etiqueta é conveniência, não requisito
            logger.warning("[BusinessSuite] nao consegui marcar a aba: %s", exc)

    publicado = False
    # A legenda não confirmada também segura o clique: depois dele, a faxina fecha a aba.
    legenda_ok = Passo.LEGENDA in feitos
    capa_ok = pode_publicar_sozinho(capa is not None, Passo.CAPA in feitos, avisos)
    if publicar_sozinho and legenda_ok and capa_ok:
        _confirmar_agendamento(pagina)
        feitos.append(Passo.PUBLICAR)
        publicado = True

    return {
        "passos": [p.value for p in feitos],
        "resumo": descricao_do_progresso(feitos),
        "capa_aplicada": Passo.CAPA in feitos,
        "agendado_para": agendamento.legivel(),
        "avisos": avisos,
        "publicado": publicado,
    }


def _conferir_conta(pagina: PaginaDoBusinessSuite) -> None:
    """O Reel só sobe na conta do canal (RN-31), lida no seletor "Share to".

    A primeira vista é aprendida, como nos outros destinos; conta que não se lê barra,
    com a mensagem da própria regra.
    """
    achou = pagina.existe("conta_do_compositor", segundos=SEGUNDOS_PARA_ELEMENTO)
    nome = nome_da_conta(pagina.texto_de("conta_do_compositor")) if achou else ""
    conta_do_destino.conferir_conta(DESTINO_DA_CONTA, Conta(id=nome, nome=f"@{nome}"))


def _legenda_ficou(pagina: PaginaDoBusinessSuite, legenda: str) -> bool:
    try:
        return " ".join(pagina.texto_de("editor_da_legenda").split()) == " ".join(legenda.split())
    except Exception:  # noqa: BLE001 — vira aviso, não interrupção
        return False


def _aplicar_capa(
    pagina: PaginaDoBusinessSuite, capa: Path | None, feitos: list[Passo], avisos: list[str]
) -> None:
    """Passo opcional, como nos outros robôs: a falha vira aviso, e o aviso segura o RN-26."""
    if capa is None:
        return
    if not capa.is_file():
        avisos.append("A capa nao esta mais em disco; a Meta vai usar um quadro do video.")
        return
    erro = _tentar_capa(pagina, capa)
    if erro:
        avisos.append(f"{erro} Troque a capa na aba antes de agendar; o arquivo esta em {capa}.")
        logger.warning("[BusinessSuite] capa nao entrou: %s", erro)
    else:
        feitos.append(Passo.CAPA)


def _tentar_capa(pagina: PaginaDoBusinessSuite, capa: Path) -> str:
    """Troca a capa e devolve o motivo quando não dá. A prova é nascer o "Change image"."""
    try:
        pagina.clicar("aba_da_capa", segundos=SEGUNDOS_PARA_CAPA)
        pagina.enviar_pelo_seletor("envio_da_capa", capa, segundos=SEGUNDOS_PARA_CAPA)
        if pagina.existe("capa_trocada", segundos=SEGUNDOS_PARA_CAPA):
            return ""
        return "Entreguei a capa, mas a tela nao confirmou a troca."
    except Exception as exc:  # noqa: BLE001 — qualquer falha aqui vira aviso
        return f"{type(exc).__name__}: {exc}"


def _avancar_ate_o_agendamento(pagina: PaginaDoBusinessSuite) -> None:
    """Clica em Next até a opção de agendar aparecer, sem contar etapas de antemão."""
    for _ in range(MAXIMO_DE_AVANCOS):
        if pagina.existe("opcao_agendar", segundos=SEGUNDOS_PARA_ACHAR_ETAPA):
            return
        _passo(
            pagina.clicar_ultimo, Passo.AVANCAR, "botao_avancar", segundos=SEGUNDOS_PARA_PROCESSAR
        )
    if not pagina.existe("opcao_agendar", segundos=SEGUNDOS_PARA_ELEMENTO):
        raise RoteiroInterrompido(
            Passo.AVANCAR, f"a opcao de agendar nao apareceu em {MAXIMO_DE_AVANCOS} etapas"
        )


def _marcar_data_e_hora(pagina: PaginaDoBusinessSuite, agendamento: Agendamento) -> None:
    """Marca e LÊ DE VOLTA: uma data errada aqui é um Reel no ar na hora errada."""
    horas, minutos, periodo = hora_em_12h(agendamento)
    tempo = SEGUNDOS_PARA_ELEMENTO

    _passo(pagina.clicar, Passo.AGENDAMENTO, "opcao_agendar", segundos=tempo)
    data = data_para_digitar(agendamento)
    _passo(pagina.substituir, Passo.AGENDAMENTO, "campo_da_data", data, segundos=tempo)
    _passo(pagina.apertar, Passo.AGENDAMENTO, "Enter")
    _passo(pagina.digitar, Passo.AGENDAMENTO, "campo_da_hora", horas, segundos=tempo)
    _passo(pagina.digitar, Passo.AGENDAMENTO, "campo_do_minuto", minutos, segundos=tempo)
    _passo(pagina.digitar, Passo.AGENDAMENTO, "campo_do_periodo", periodo, segundos=tempo)
    _passo(pagina.clicar, Passo.AGENDAMENTO, "titulo_do_agendamento", segundos=tempo)

    mostrada = pagina.valor_de("campo_da_data")
    if not agendamento.mostrada_em(mostrada):
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO, f"pedi {agendamento.data_iso()} e o campo ficou {mostrada!r}"
        )
    lida = (
        pagina.atributo_de("campo_da_hora", "aria-valuenow"),
        pagina.atributo_de("campo_do_minuto", "aria-valuenow"),
        pagina.atributo_de("campo_do_periodo", "aria-valuetext"),
    )
    if not hora_marcada(agendamento, *lida):
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO, f"pedi {horas}:{minutos} {periodo} e os campos ficaram {lida}"
        )
    logger.info("[BusinessSuite] data marcada: %s", agendamento.legivel())


def _confirmar_agendamento(pagina: PaginaDoBusinessSuite) -> None:
    """Clica em agendar e espera a lista de agendados, a prova do cabeçalho do domínio."""
    _passo(pagina.clicar, Passo.PUBLICAR, "botao_agendar", segundos=SEGUNDOS_PARA_ELEMENTO)
    limite = time.monotonic() + SEGUNDOS_PARA_CONFIRMAR
    while time.monotonic() < limite:
        if agendou(pagina.url_atual()):
            logger.info("[BusinessSuite] reel agendado")
            return
        time.sleep(INTERVALO_DA_CONFIRMACAO)
    raise RoteiroInterrompido(
        Passo.PUBLICAR, f"a lista de agendados nao abriu em {int(SEGUNDOS_PARA_CONFIRMAR)}s"
    )


def _passo(funcao, passo: Passo, *args, **kwargs) -> None:
    """Roda um verbo da página traduzindo qualquer falha para o passo."""
    try:
        funcao(*args, **kwargs)
    except RoteiroInterrompido:
        raise
    except Exception as exc:  # noqa: BLE001 — a origem varia, o destino não
        raise RoteiroInterrompido(passo, f"{type(exc).__name__}: {exc}") from exc


def perfil_do_chrome() -> Path:
    """O perfil do robô do Instagram: ver o cabeçalho do módulo."""
    return instagram_reels.perfil_do_chrome()


def _assistir(
    video: Path,
    legenda: str,
    capa: Path | None,
    agendamento: Agendamento,
    marca: str,
    publicar_sozinho: bool,
) -> dict:
    """Tudo o que fala Playwright, num thread só (síncrono por causa da D-369)."""
    try:
        with sessao_no_chrome(
            perfil_do_chrome(), abrir_em=URL_DO_COMPOSITOR, executavel=executavel_escolhido()
        ) as (navegador, abriu_agora):
            contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
            relatorio = executar_roteiro(
                # O Escape abre um aviso de descarte no compositor do Instagram;
                # aqui ele não tem o que fechar, e nada ganha em arriscar.
                PaginaDoBusinessSuite(contexto.new_page(), SELETORES, escapar_apos_escrever=False),
                video=video,
                legenda=legenda,
                capa=capa,
                agendamento=agendamento,
                marca=marca,
                publicar_sozinho=publicar_sozinho,
            )
            return {**relatorio, "chrome_aberto_agora": abriu_agora}
    except (PlaywrightAusente, ChromeNaoAbriu) as exc:
        raise RoteiroInterrompido(Passo.ABRIR, str(exc)) from exc


def _vigiar_agendamento(segundos: float, marca: str, parar: threading.Event | None) -> bool:
    """Espera o operador clicar em agendar. `True` só quando VIU a lista de agendados."""
    try:
        with sessao_no_chrome(perfil_do_chrome()) as (navegador, _):
            contexto = navegador.contexts[0] if navegador.contexts else None
            alvo = aba_marcada(contexto, marca, DOMINIO) if contexto else None
            if alvo is None:
                return False

            def conferir() -> bool | None:
                if agendou(alvo.url):
                    logger.info("[BusinessSuite] lista de agendados vista; o reel ficou marcado")
                    return True
                return None if no_compositor(alvo.url) else False

            return vigiar_aba(
                alvo,
                segundos,
                parar,
                conferir,
                rotulo="[BusinessSuite]",
                verbo="agendar",
                intervalo=INTERVALO_DA_VIGILIA,
            )
    except PlaywrightAusente:
        return False
    except Exception as exc:  # noqa: BLE001 — vigília nunca derruba nada
        logger.info("[BusinessSuite] vigilia interrompida: %s", exc)
        return False


async def subir_assistido(
    *,
    video: Path,
    legenda: str,
    capa: Path | None,
    agendamento: Agendamento,
    marca: str = "",
    publicar_sozinho: bool = False,
) -> dict:
    """Deixa o Reel com data marcada no criador, conferida antes a conta logada (RN-31)."""
    if not video.is_file():
        raise RoteiroInterrompido(Passo.ARQUIVO, "o MP4 do pacote nao esta em disco")
    await conta_do_destino.conferir_no_navegador(
        "instagram_web", perfil_do_chrome(), instagram_reels.URL_INICIAL
    )

    logger.info("[BusinessSuite] agendando %s para %s", video.name, agendamento.legivel())
    return await asyncio.to_thread(
        _assistir, video, legenda, capa, agendamento, marca, publicar_sozinho
    )


async def aguardar_publicacao(
    *,
    segundos: float = SEGUNDOS_DE_VIGILIA,
    marca: str = "",
    parar: threading.Event | None = None,
) -> bool:
    """Espera o operador clicar em agendar, sem prender a requisição HTTP."""
    return await asyncio.to_thread(_vigiar_agendamento, segundos, marca, parar)

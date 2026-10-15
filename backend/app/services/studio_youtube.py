"""O robô do YouTube Studio: monetização e vídeo relacionado do short (D-895).

O porquê de ser o navegador está em `domain/publicacao/studio_youtube.py`.

## A fila

Cada upload que dá certo (corte ou short) entra aqui com `agendar`, e um único
trabalhador esvazia a fila numa sessão do navegador. O respiro antes da primeira
visita é o que junta o lote: enquanto os cinco cortes sobem, um atrás do outro,
as tarefas se acumulam, e o robô abre o Studio uma vez para todas — não uma
janela por vídeo.

Não sabe senha: o operador loga uma vez na janela do robô, e o perfil guarda a
sessão (ver `navegador_assistido`).
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Protocol

from app.core import channel_paths
from app.domain.compartilhado.erros import ServicoExternoFalhou
from app.domain.publicacao.studio_youtube import (
    TRECHO_DO_LOGIN,
    URL_DO_STUDIO,
    TarefaNoStudio,
    a_monetizar,
    atualizados_do_aviso,
    canal_da_url,
    esta_monetizado,
    juntar,
    tarefa_do_upload,
    url_da_edicao,
    url_da_lista,
)
from app.infrastructure import studio_youtube_store
from app.services import janela_do_robo, navegador_assistido, navegador_do_robo
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)

PLATAFORMA = "youtube"

# Segundos.
RESPIRO_ANTES_DE_COMECAR = 45
PRAZO_PARA_ABRIR = 60
PRAZO_PARA_O_CAMPO = 30
PRAZO_PARA_SALVAR = 30
# Medido em 15/10/2026: 1 vídeo levou ~12 s entre o "Update videos" e o aviso.
# O Studio processa a fila dele em lote; folga para um lote de shorts inteiro.
PRAZO_DA_ATUALIZACAO = 300
PRAZO_POR_LINHA = 5
INTERVALO_DE_CONFERENCIA = 1

# Medidos no Studio real, numa janela logada no canal: ids, componentes e
# `test-id`, nada de texto — o Studio da janela do robô pode estar em inglês.
#
# A monetização vai pela EDIÇÃO EM MASSA da lista de Conteúdo (D-935, medida em
# 15/10/2026): marcar as linhas → Editar → Monetização (já vem "On") → Update
# videos → "I understand..." → Update videos. Pela página de cada vídeo (D-895)
# o Studio pedia preenchimentos a mais e o robô não terminava.
#
# O cartão do relacionado não tem `<img>`: a miniatura é `background-image`
# inline num `div.thumbnail`, com o id do vídeo no endereço (ver
# `clicar_cartao_do_video`). Escolher o cartão já fecha a lista.
SELETORES: dict[str, str] = {
    "linha_do_video": "ytcp-video-row",
    "editar_em_massa": "ytcp-bulk-actions ytcp-select",
    "item_monetizacao": 'tp-yt-paper-item[test-id="MONETIZATION"]',
    "opcao_em_massa": "ytpp-bulk-actions-editor-monetization ytcp-select",
    "atualizar_videos": "ytcp-bulk-actions #submit-button",
    "entendo": "ytcp-confirmation-dialog #confirm-checkbox",
    "confirmar": "ytcp-confirmation-dialog #confirm-button",
    "aviso": "tp-yt-paper-toast#paper-toast",
    "salvar": "ytcp-button#save",
    "video_relacionado": "ytcp-shorts-content-links-picker #linked-video-editor-link",
    "busca_do_relacionado": "ytcp-video-pick-dialog #search-yours",
    "cartao_do_relacionado": "ytcp-video-pick-dialog ytcp-entity-card",
}

_pendentes: list[TarefaNoStudio] = []
_trabalhando = False


class PaginaDoStudio(Protocol):
    """Os verbos de que o roteiro precisa — nenhum seletor (ver `SELETORES`)."""

    def abrir(self, url: str, *, segundos: float) -> None: ...
    def url_atual(self) -> str: ...
    def existe(self, alvo: str, *, segundos: float, visivel: bool = True) -> bool: ...
    def texto_de(self, alvo: str) -> str: ...
    def clicar(self, alvo: str, *, segundos: float) -> None: ...
    def escrever(self, alvo: str, texto: str, *, segundos: float) -> None: ...
    def clicar_cartao_do_video(self, alvo: str, video_id: str, *, segundos: float) -> None: ...
    def marcar_video(self, alvo: str, video_id: str, *, segundos: float) -> bool: ...
    def habilitado(self, alvo: str) -> bool: ...
    def aguardar(self, segundos: float) -> None: ...
    def fechar(self) -> None: ...


class PaginaDoPlaywrightNoStudio(navegador_assistido.PaginaDoPlaywright):
    """A `PaginaDoPlaywright` com os verbos que só o Studio pede."""

    def clicar_cartao_do_video(self, alvo: str, video_id: str, *, segundos: float) -> None:
        """O cartão cuja miniatura é a do vídeo: o id está no endereço da imagem.

        Pelo id e não pelo título: dois cortes da mesma live podem ter títulos
        quase iguais, e a miniatura (`i.ytimg.com/vi/<id>/...`) não erra.
        """
        cartao = self._page.locator(f'{self._css(alvo)}:has([style*="/vi/{video_id}/"])')
        cartao.first.click(timeout=segundos * 1000)

    def marcar_video(self, alvo: str, video_id: str, *, segundos: float) -> bool:
        """Marca a linha do vídeo na lista de Conteúdo; `False` se ela não está na página.

        Pelo link da linha (`/video/<id>/edit`). O clique vai no componente e não
        no `#checkbox`: medido, o contêiner por cima intercepta o clique nele.
        """
        linha = self._page.locator(f'{self._css(alvo)}:has(a[href*="/video/{video_id}/"])').first
        try:
            linha.wait_for(state="visible", timeout=segundos * 1000)
        except Exception:  # noqa: BLE001 — fora da primeira página: resposta, não erro
            return False
        caixa = linha.locator("ytcp-checkbox-lit").first
        if caixa.locator("#checkbox").get_attribute("aria-checked") != "true":
            caixa.click(timeout=segundos * 1000)
        return True

    def habilitado(self, alvo: str) -> bool:
        try:
            botao = self._page.locator(self._css(alvo)).first
            return botao.is_enabled() and botao.get_attribute("aria-disabled") != "true"
        except Exception:  # noqa: BLE001 — botão sumiu: não há o que salvar
            return False

    def aguardar(self, segundos: float) -> None:
        """Espera DENTRO do Playwright, e não com `time.sleep`.

        Medido em 15/10/2026: no Playwright síncrono, a URL e os eventos da página
        só chegam quando o código fala com o navegador. Com `time.sleep` no laço,
        o redirecionamento do Studio para `/channel/<id>` (1,5 s) nunca era visto.
        """
        self._page.wait_for_timeout(segundos * 1000)

    def fechar(self) -> None:
        try:
            self._page.close()
        except Exception as exc:  # noqa: BLE001 — aba já fechada pelo operador
            logger.info("[Studio] não consegui fechar a aba: %s", exc)


# --------------------------------------------------------------------------- #
# Configuração do canal (ADR-0012)
# --------------------------------------------------------------------------- #


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def ler_configuracao() -> dict:
    monetizar, relacionar_short = studio_youtube_store.ler(*_banco_e_canal())
    return {"monetizar": monetizar, "relacionar_short": relacionar_short}


def gravar_configuracao(*, monetizar: bool, relacionar_short: bool) -> dict:
    studio_youtube_store.gravar(
        *_banco_e_canal(), monetizar=monetizar, relacionar_short=relacionar_short
    )
    return ler_configuracao()


# --------------------------------------------------------------------------- #
# A fila
# --------------------------------------------------------------------------- #


def agendar(video_id: str, *, relacionado: str = "", short: bool = False) -> None:
    """Põe o vídeo recém-subido na fila do Studio, se o canal pediu (RN-27).

    NUNCA levanta: quando isto roda, o vídeo já está no canal, e derrubar o
    upload por causa do robô faria a fila subi-lo de novo.
    """
    global _trabalhando
    try:
        config = ler_configuracao()
        tarefa = tarefa_do_upload(
            video_id,
            relacionado=relacionado,
            monetizar=config["monetizar"],
            relacionar=config["relacionar_short"],
            short=short,
        )
        if tarefa.vazia:
            return
        _pendentes.append(tarefa)
        if not _trabalhando:
            _trabalhando = True
            fire_and_forget(_esvaziar(), name=f"studio-youtube-{video_id}")
    except Exception as exc:  # noqa: BLE001 — o vídeo já subiu; o robô é extra
        logger.warning("[Studio] não agendei %s: %s", video_id, exc)


async def _esvaziar() -> None:
    global _trabalhando
    try:
        await asyncio.sleep(RESPIRO_ANTES_DE_COMECAR)
        while _pendentes:
            tarefas = juntar(_pendentes[:])
            _pendentes.clear()
            falhas = await asyncio.to_thread(_no_navegador, tarefas)
            for falha in falhas:
                logger.warning("[Studio] %s", falha)
    finally:
        _trabalhando = False


# --------------------------------------------------------------------------- #
# O roteiro
# --------------------------------------------------------------------------- #


def executar_roteiro(pagina: PaginaDoStudio, tarefas: list[TarefaNoStudio]) -> list[str]:
    """Monetiza o lote em massa e depois liga o relacionado de cada short.

    Devolve o que não deu. A aba só fecha quando tudo deu certo: é nela que o
    operador lê o motivo.
    """
    falhas = _monetizar_tudo(pagina, tarefas)
    if not _pediu_login(pagina):
        falhas += _relacionar_todos(pagina, tarefas)
    if not falhas:
        pagina.fechar()
    return falhas


def _monetizar_tudo(pagina: PaginaDoStudio, tarefas: list[TarefaNoStudio]) -> list[str]:
    """Uma edição em massa por aba: Vídeos (os cortes) e Shorts."""
    if not any(t.monetizar for t in tarefas):
        return []
    try:
        canal = _canal(pagina)
        falhas: list[str] = []
        for shorts in (False, True):
            ids = a_monetizar(tarefas, shorts=shorts)
            if ids:
                falhas += monetizar_em_massa(pagina, canal, ids, shorts=shorts)
        return falhas
    except ServicoExternoFalhou as exc:
        return [f"monetização: {exc}"]
    except Exception as exc:  # noqa: BLE001 — tela mudou: dizer onde parou
        motivo = (str(exc).splitlines() or [type(exc).__name__])[0]
        return [f"monetização: o robô parou na lista do Studio ({motivo})"]


def _relacionar_todos(pagina: PaginaDoStudio, tarefas: list[TarefaNoStudio]) -> list[str]:
    """Um short por vez — o relacionado não existe na edição em massa."""
    falhas: list[str] = []
    for tarefa in tarefas:
        if not tarefa.relacionado:
            continue
        try:
            relacionar(pagina, tarefa.video_id, tarefa.relacionado)
        except ServicoExternoFalhou as exc:
            falhas.append(f"{tarefa.video_id}: {exc}")
            if _pediu_login(pagina):
                break
        except Exception as exc:  # noqa: BLE001 — tela mudou: dizer onde parou e seguir
            motivo = (str(exc).splitlines() or [type(exc).__name__])[0]
            falhas.append(f"{tarefa.video_id}: o robô parou no Studio ({motivo})")
    return falhas


def _canal(pagina: PaginaDoStudio) -> str:
    """O id do canal: a página inicial do Studio redireciona para `/channel/<id>`."""
    _abrir(pagina, URL_DO_STUDIO)
    limite = time.monotonic() + PRAZO_PARA_ABRIR
    while time.monotonic() < limite:
        canal = canal_da_url(pagina.url_atual())
        if canal:
            return canal
        if _pediu_login(pagina):
            break
        pagina.aguardar(INTERVALO_DE_CONFERENCIA)
    raise ServicoExternoFalhou(
        "o Studio não abriu o canal — faça login na conta do canal na janela do robô"
    )


def monetizar_em_massa(
    pagina: PaginaDoStudio, canal: str, ids: list[str], *, shorts: bool
) -> list[str]:
    """Marca os vídeos na lista → Editar → Monetização On → Update videos → confirma.

    Devolve o que ficou de fora: vídeo fora da primeira página da aba (o lote
    recém-subido está no topo) ou o Studio atualizando menos do que pedimos.
    """
    aba = "Shorts" if shorts else "Vídeos"
    _abrir(pagina, url_da_lista(canal, shorts=shorts))
    if not pagina.existe("linha_do_video", segundos=PRAZO_PARA_ABRIR):
        raise ServicoExternoFalhou(f"a aba {aba} da lista de Conteúdo não carregou")
    marcados = [
        v for v in ids if pagina.marcar_video("linha_do_video", v, segundos=PRAZO_POR_LINHA)
    ]
    faltando = [f"{v}: não está na primeira página da aba {aba}" for v in ids if v not in marcados]
    if not marcados:
        return faltando
    pagina.clicar("editar_em_massa", segundos=PRAZO_PARA_O_CAMPO)
    pagina.clicar("item_monetizacao", segundos=PRAZO_PARA_O_CAMPO)
    if not esta_monetizado(pagina.texto_de("opcao_em_massa")):
        raise ServicoExternoFalhou("a edição em massa não ofereceu Monetização: On")
    pagina.clicar("atualizar_videos", segundos=PRAZO_PARA_O_CAMPO)
    pagina.clicar("entendo", segundos=PRAZO_PARA_O_CAMPO)
    _esperar_habilitado(pagina, "confirmar")
    pagina.clicar("confirmar", segundos=PRAZO_PARA_O_CAMPO)
    atualizados, total = _esperar_aviso(pagina)
    if atualizados < total:
        faltando.append(f"o Studio atualizou {atualizados} de {total} na aba {aba}")
    return faltando


def _esperar_habilitado(pagina: PaginaDoStudio, alvo: str) -> None:
    """O "Update videos" da confirmação só acende depois do "I understand"."""
    limite = time.monotonic() + PRAZO_PARA_O_CAMPO
    while time.monotonic() < limite:
        if pagina.habilitado(alvo):
            return
        pagina.aguardar(INTERVALO_DE_CONFERENCIA)
    raise ServicoExternoFalhou("o Studio não liberou a confirmação da edição em massa")


def _esperar_aviso(pagina: PaginaDoStudio) -> tuple[int, int]:
    """Até o aviso "N of M video(s) successfully updated" — o Studio dizendo que terminou."""
    limite = time.monotonic() + PRAZO_DA_ATUALIZACAO
    while time.monotonic() < limite:
        contagem = atualizados_do_aviso(pagina.texto_de("aviso"))
        if contagem:
            return contagem
        pagina.aguardar(INTERVALO_DE_CONFERENCIA)
    raise ServicoExternoFalhou(
        "o Studio não confirmou a monetização em massa — confira na janela do robô"
    )


def relacionar(pagina: PaginaDoStudio, short_id: str, longo_id: str) -> None:
    """Detalhes do short → Vídeo relacionado → o corte de onde ele saiu → Salvar."""
    _abrir(pagina, url_da_edicao(short_id))
    if not pagina.existe("video_relacionado", segundos=PRAZO_PARA_O_CAMPO):
        raise ServicoExternoFalhou("não achei o campo Vídeo relacionado do short")
    pagina.clicar("video_relacionado", segundos=PRAZO_PARA_O_CAMPO)
    pagina.escrever("busca_do_relacionado", longo_id, segundos=PRAZO_PARA_O_CAMPO)
    try:
        pagina.clicar_cartao_do_video(
            "cartao_do_relacionado", longo_id, segundos=PRAZO_PARA_O_CAMPO
        )
    except Exception as exc:  # noqa: BLE001 — o do Playwright não é o TimeoutError do Python
        raise ServicoExternoFalhou(
            f"o corte {longo_id} não apareceu na lista do Studio (ainda não está público?)"
        ) from exc
    _salvar(pagina)


def _abrir(pagina: PaginaDoStudio, url: str) -> None:
    pagina.abrir(url, segundos=PRAZO_PARA_ABRIR)
    if _pediu_login(pagina):
        raise ServicoExternoFalhou(
            "o YouTube pediu login na janela do robô. Entre na conta do canal ali uma vez "
            "— a sessão fica guardada."
        )


def _pediu_login(pagina: PaginaDoStudio) -> bool:
    return TRECHO_DO_LOGIN in pagina.url_atual()


def _salvar(pagina: PaginaDoStudio) -> None:
    """Salvar e esperar o botão apagar — é o Studio dizendo que gravou."""
    pagina.clicar("salvar", segundos=PRAZO_PARA_O_CAMPO)
    limite = time.monotonic() + PRAZO_PARA_SALVAR
    while time.monotonic() < limite:
        if not pagina.habilitado("salvar"):
            return
        pagina.aguardar(INTERVALO_DE_CONFERENCIA)
    raise ServicoExternoFalhou("o Studio não confirmou o Salvar — confira na janela do robô")


def _no_navegador(tarefas: list[TarefaNoStudio]) -> list[str]:
    """A parte síncrona: Playwright sync numa thread (o async quebra no uvicorn/Windows, D-369)."""
    perfil = navegador_do_robo.perfil_da_plataforma(PLATAFORMA)
    try:
        with navegador_assistido.sessao_no_chrome(
            perfil, abrir_em=URL_DO_STUDIO, executavel=navegador_do_robo.executavel_escolhido()
        ) as (navegador, _):
            contexto = navegador.contexts[0] if navegador.contexts else navegador.new_context()
            # Sem o Escape depois de digitar: no Studio ele fecha a lista do relacionado.
            pagina = PaginaDoPlaywrightNoStudio(
                contexto.new_page(), SELETORES, escapar_apos_escrever=False
            )
            falhas = executar_roteiro(pagina, tarefas)
    except (
        navegador_assistido.NavegadorIndisponivel,
        navegador_assistido.PlaywrightAusente,
    ) as exc:
        return [f"não consegui abrir o navegador do robô: {exc}"]
    except Exception as exc:  # noqa: BLE001 — conexão caída no meio: o lote já saiu da fila
        motivo = (str(exc).splitlines() or [type(exc).__name__])[0]
        falhas = [f"o robô parou no Studio antes de terminar o lote: {motivo}"]
    if falhas:
        # A janela nasce fora da tela; o que deu errado se lê NELA (D-799).
        janela_do_robo.mostrar(navegador_assistido.sessao_no_chrome(perfil))
    return falhas

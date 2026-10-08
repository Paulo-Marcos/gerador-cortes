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
    esta_monetizado,
    juntar,
    tarefa_do_upload,
    url_da_edicao,
    url_da_monetizacao,
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
INTERVALO_DE_CONFERENCIA = 1

# Medidos no Studio real em 08/10/2026, numa janela logada no canal: ids e
# componentes, nada de texto — o Studio da janela do robô pode estar em inglês.
# O cartão do relacionado não tem `<img>`: a miniatura é `background-image`
# inline num `div.thumbnail`, com o id do vídeo no endereço (ver
# `clicar_cartao_do_video`). Escolher o cartão já fecha a lista.
SELETORES: dict[str, str] = {
    "seletor_de_monetizacao": "ytcp-video-monetization",
    "opcao_ativada": "ytcp-video-monetization-edit-dialog #radio-on",
    "concluido": "ytcp-video-monetization-edit-dialog #save-button",
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
    def habilitado(self, alvo: str) -> bool: ...
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

    def habilitado(self, alvo: str) -> bool:
        try:
            botao = self._page.locator(self._css(alvo)).first
            return botao.is_enabled() and botao.get_attribute("aria-disabled") != "true"
        except Exception:  # noqa: BLE001 — botão sumiu: não há o que salvar
            return False

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


def agendar(video_id: str, *, relacionado: str = "") -> None:
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
    """Visita cada vídeo e devolve o que não deu — uma falha não para os outros.

    Sessão caída para tudo: todo vídeo seguinte falharia do mesmo jeito.
    """
    falhas: list[str] = []
    for tarefa in tarefas:
        try:
            if tarefa.monetizar:
                monetizar(pagina, tarefa.video_id)
            if tarefa.relacionado:
                relacionar(pagina, tarefa.video_id, tarefa.relacionado)
        except ServicoExternoFalhou as exc:
            falhas.append(f"{tarefa.video_id}: {exc}")
            if _pediu_login(pagina):
                break
        except Exception as exc:  # noqa: BLE001 — tela mudou: dizer onde parou e seguir
            motivo = (str(exc).splitlines() or [type(exc).__name__])[0]
            falhas.append(f"{tarefa.video_id}: o robô parou no Studio ({motivo})")
    if not falhas:
        pagina.fechar()
    return falhas


def monetizar(pagina: PaginaDoStudio, video_id: str) -> None:
    """Aba Monetização → Ativada → Concluído → Salvar. Já ativada não mexe."""
    _abrir(pagina, url_da_monetizacao(video_id))
    if not pagina.existe("seletor_de_monetizacao", segundos=PRAZO_PARA_O_CAMPO):
        raise ServicoExternoFalhou(
            "não achei a monetização do vídeo — o canal está no Programa de Parcerias?"
        )
    if esta_monetizado(pagina.texto_de("seletor_de_monetizacao")):
        return
    pagina.clicar("seletor_de_monetizacao", segundos=PRAZO_PARA_O_CAMPO)
    pagina.clicar("opcao_ativada", segundos=PRAZO_PARA_O_CAMPO)
    pagina.clicar("concluido", segundos=PRAZO_PARA_O_CAMPO)
    _salvar(pagina)


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
        time.sleep(INTERVALO_DE_CONFERENCIA)
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
    if falhas:
        # A janela nasce fora da tela; o que deu errado se lê NELA (D-799).
        janela_do_robo.mostrar(navegador_assistido.sessao_no_chrome(perfil))
    return falhas

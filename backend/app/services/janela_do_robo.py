"""A janela do Chrome do robô: nasce escondida, não rouba o foco, volta na hora certa (D-799).

A regra do porquê está em `domain/publicacao/janela_do_robo.py`. Aqui fica o
braço que a executa:

- `abrir_escondido` lança o Chrome com a oclusão desligada e fora da tela;
- `devolver_foco` desfaz o roubo de foco do nascimento;
- `fechar_se_antigo` troca o Chrome de uma versão anterior, que ainda fica
  branco quando coberto, por um novo — só quando ninguém está usando;
- `mostrar` traz a janela para a tela quando é a vez do operador revisar,
  sem pular na frente do que ele está fazendo.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from app.domain.publicacao.janela_do_robo import (
    POSICAO_DE_REVISAO,
    TAMANHO_DA_JANELA,
    argumentos_da_janela,
    falta_modo_invisivel,
)
from app.infrastructure import foco_do_windows

logger = logging.getLogger(__name__)

# Quanto esperamos o Chrome antigo soltar a porta depois de pedir que feche.
_SEGUNDOS_PARA_FECHAR = 15.0

_EM_USO: Counter[str] = Counter()
_TRAVA_DO_USO = threading.Lock()


@dataclass(frozen=True)
class ChromeAberto:
    """O processo recém-lançado e a janela que tinha o foco antes dele."""

    pid: int
    foco_antes: int


@contextmanager
def em_uso(perfil: Path) -> Iterator[None]:
    """Marca que um roteiro ou uma vigília está falando com o Chrome deste perfil.

    É o que impede `fechar_se_antigo` de derrubar uma janela no meio de um
    upload ou com uma aba esperando o operador publicar.
    """
    chave = str(perfil).casefold()
    with _TRAVA_DO_USO:
        _EM_USO[chave] += 1
    try:
        yield
    finally:
        with _TRAVA_DO_USO:
            _EM_USO[chave] -= 1


def _alguem_usando(perfil: Path) -> bool:
    with _TRAVA_DO_USO:
        return _EM_USO[str(perfil).casefold()] > 0


def abrir_escondido(
    popen: Callable[..., object], chrome: Path, porta: int, perfil: Path, url: str
) -> ChromeAberto:
    """Lança o Chrome do robô fora da tela, com a oclusão desligada.

    `popen` vem de quem chama para que o lançamento continue substituível nos
    testes pelo mesmo ponto de sempre (`navegador_assistido.subprocess`).
    """
    import subprocess

    foco_antes = foco_do_windows.janela_da_frente()
    processo = popen(  # noqa: S603 — caminho conhecido, argumentos nossos
        [
            str(chrome),
            f"--remote-debugging-port={porta}",
            f"--user-data-dir={perfil}",
            "--no-first-run",
            "--no-default-browser-check",
            *argumentos_da_janela(),
            url,
        ],
        creationflags=getattr(subprocess, "DETACHED_PROCESS", 0),
    )
    return ChromeAberto(pid=int(getattr(processo, "pid", 0) or 0), foco_antes=foco_antes)


def devolver_foco(aberto: ChromeAberto) -> None:
    """Desfaz o roubo de foco do nascimento, se foi o nosso Chrome que roubou."""
    if aberto.pid and foco_do_windows.devolver_se_roubado(aberto.foco_antes, aberto.pid):
        logger.info("[Janela] foco devolvido depois de abrir o Chrome do robo")


def _linha_de_comando_na_porta(porta: int) -> list[str]:
    try:
        import psutil

        for conexao in psutil.net_connections(kind="inet"):
            if conexao.laddr and conexao.laddr.port == porta and conexao.pid:
                if conexao.status == psutil.CONN_LISTEN:
                    return psutil.Process(conexao.pid).cmdline()
    except Exception as exc:  # noqa: BLE001 — nao saber e resposta valida
        logger.debug("[Janela] nao li a linha de comando da porta %s: %s", porta, exc)
    return []


def fechar_se_antigo(perfil: Path, porta: int, *, responde: Callable[[int], bool]) -> bool:
    """Fecha o Chrome deste perfil se ele nasceu sem o modo invisível; diz se fechou.

    Só fecha quando ninguém deste processo está usando a janela (`em_uso`):
    derrubar uma aba esperando o Publicar jogaria fora um upload pronto. Fechar
    pelo CDP, e não matando o processo, deixa o Chrome guardar a sessão como
    guarda quando o operador fecha a janela.
    """
    if not falta_modo_invisivel(_linha_de_comando_na_porta(porta)) or _alguem_usando(perfil):
        return False
    logger.info("[Janela] o Chrome do robo e de antes do modo invisivel; reabrindo")
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            navegador = pw.chromium.connect_over_cdp(f"http://127.0.0.1:{porta}")
            navegador.new_browser_cdp_session().send("Browser.close")
    except Exception as exc:  # noqa: BLE001 — o Chrome fecha e derruba a conexao
        logger.debug("[Janela] Browser.close: %s", exc)
    limite = time.monotonic() + _SEGUNDOS_PARA_FECHAR
    while responde(porta) and time.monotonic() < limite:
        time.sleep(0.5)
    return not responde(porta)


def fechar_aba(pagina) -> None:
    """Fecha a aba que já cumpriu o papel. Faxina: nunca desfaz o que foi visto."""
    try:
        pagina.close()
    except Exception as exc:  # noqa: BLE001 — aba ja fechada ou Chrome saindo
        logger.debug("[Janela] nao fechei a aba: %s", exc)


def mostrar(conexao) -> bool:
    """Traz a janela do robô para a tela, sem ativá-la; diz se trouxe.

    É a hora de o operador revisar. Aparecer NA FRENTE seria interromper o que
    ele está fazendo; a janela fica na tela, e ele a abre pela barra de tarefas.

    `conexao` é o `sessao_no_chrome(perfil)` de quem chama: este módulo é usado
    PELA camada do navegador, e importá-la de volta fecharia um ciclo.
    """
    x, y = POSICAO_DE_REVISAO
    largura, altura = TAMANHO_DA_JANELA
    try:
        with conexao as (navegador, _):
            contexto = navegador.contexts[0] if navegador.contexts else None
            if contexto is None or not contexto.pages:
                return False
            sessao = contexto.new_cdp_session(contexto.pages[-1])
            janela = sessao.send("Browser.getWindowForTarget")["windowId"]
            # Janela minimizada não aceita posição: primeiro volta ao normal.
            sessao.send(
                "Browser.setWindowBounds", {"windowId": janela, "bounds": {"windowState": "normal"}}
            )
            sessao.send(
                "Browser.setWindowBounds",
                {
                    "windowId": janela,
                    "bounds": {"left": x, "top": y, "width": largura, "height": altura},
                },
            )
            return True
    except Exception as exc:  # noqa: BLE001 — mostrar a janela nunca derruba nada
        logger.info("[Janela] nao consegui trazer a janela do robo para a tela: %s", exc)
        return False

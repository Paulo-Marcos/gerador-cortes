"""O navegador em que o robô do TikTok e do Instagram abre: Chrome ou Edge (D-832).

A escolha é do canal, no banco, editável na tela (ADR-0012). O Chrome continua
o padrão: quem nunca escolheu segue exatamente como antes.

## Por que o Edge tem perfil próprio

Chrome e Edge não dividem a pasta de sessão. O Chrome cifra os cookies com uma
chave que só ele abre: o Edge, apontado para a mesma pasta, chegaria deslogado
— e, ao regravá-la, deslogaria o Chrome também. Por isso o Edge ganha a pasta
dele ao lado (`browser/tiktok-edge`). O custo é um login na primeira vez; a
porta vem do caminho, então as duas janelas nunca se cruzam.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from app.core import channel_paths
from app.domain.compartilhado.erros import PedidoInvalido
from app.infrastructure import navegador_do_robo_store
from app.infrastructure.executaveis_do_navegador import edge_no_disco
from app.services.navegador_assistido import ChromeNaoAbriu, perfil_do_canal

Navegador = Literal["chrome", "edge"]
CHROME: Navegador = "chrome"
EDGE: Navegador = "edge"
NAVEGADORES: tuple[Navegador, ...] = (CHROME, EDGE)


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def _conhecido(navegador: str) -> Navegador | None:
    return next((n for n in NAVEGADORES if n == navegador), None)


def navegador_do_canal() -> Navegador:
    """O navegador escolhido para o canal ativo; o Chrome quando não há escolha."""
    return _conhecido(navegador_do_robo_store.ler(*_banco_e_canal())) or CHROME


def escolher_navegador(navegador: str) -> Navegador:
    """Grava a escolha do canal ativo e a devolve."""
    escolhido = _conhecido(navegador)
    if escolhido is None:
        raise PedidoInvalido(f"navegador desconhecido: {navegador!r}; use chrome ou edge")
    navegador_do_robo_store.gravar(*_banco_e_canal(), escolhido)
    return escolhido


def perfil_da_plataforma(plataforma: str) -> Path:
    """A pasta da sessão da plataforma no navegador escolhido (ver o docstring do módulo)."""
    if navegador_do_canal() == EDGE:
        return perfil_do_canal(f"{plataforma}-edge")
    return perfil_do_canal(plataforma)


def executavel_escolhido() -> Path | None:
    """O executável a abrir; `None` é o Chrome de sempre.

    `None`, e não o caminho do Chrome, para o `garantir_chrome` seguir com a
    busca e as mensagens do `CHROME_PATH` que já tinha.
    """
    if navegador_do_canal() != EDGE:
        return None
    edge = edge_no_disco()
    if edge is None:
        raise ChromeNaoAbriu(
            "o Microsoft Edge não foi encontrado nesta máquina; instale-o ou escolha "
            "o Chrome em Configurações"
        )
    return edge

"""O relógio do agendamento, fechado antes de a aba sair das mãos do robô (D-1098).

Escolher hora e minuto deixa o seletor ABERTO por cima do formulário. Quando o
robô publica sozinho, ninguém vê: o clique em Publicar fecha o seletor. Mas
quando a RN-26 segura a publicação (corte deitado sem capa vertical), a aba
chega ao operador com o relógio aberto — e ele lê "travou no meio do
agendamento" onde o robô já tinha terminado e só esperava por ele. Medido na
PROD em 09/11/2026.
"""

from __future__ import annotations

import logging

from app.domain.publicacao.tiktok_studio import Passo, RoteiroInterrompido
from app.services.capa_no_tiktok_studio import PaginaQueOuve

logger = logging.getLogger(__name__)


def fechar(pagina: PaginaQueOuve, alvo: str) -> None:
    """Fecha o seletor de hora com Escape e confere que a hora pedida ficou.

    Escape, e não clique fora: é o gesto que fecha um popover sem escolher nada,
    e o robô já o aperta nesta mesma página depois de escrever a legenda
    (`PaginaDoPlaywright.escrever`). Clicar "fora" exigiria adivinhar um alvo
    neutro numa página que se redesenha.

    Fechar é acabamento, e falhar nele não desfaz o agendamento já conferido —
    vira log. Já a hora mudar no fechamento é outra coisa: um seletor que trata
    o Escape como "cancelar" devolveria a aba com a data errada e a consciência
    tranquila, então ali o roteiro para no passo do agendamento.
    """
    try:
        if pagina.existe("hora_do_seletor", segundos=1.0):
            pagina.apertar("Escape")
    except Exception as exc:  # noqa: BLE001 — relógio aberto é feio, não é erro
        logger.warning("[TikTokStudio] nao consegui fechar o relogio: %s", exc)
        return

    escrito = pagina.valor_de("campo_da_hora")
    if escrito != alvo:
        raise RoteiroInterrompido(
            Passo.AGENDAMENTO, f"pedi {alvo} e, ao fechar o relogio, o campo ficou {escrito!r}"
        )

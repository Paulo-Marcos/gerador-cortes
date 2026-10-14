"""O que a camada do Remotion do short recebe: cenas, gancho e legenda.

Saiu do `render_short.py` (D-913), que está no teto de tamanho: o render monta
o quadro e chama o Remotion; o CONTEÚDO do props.json da camada mora aqui.
"""

from __future__ import annotations

from typing import Any

from app.services import palco_componentes


def props_da_camada(contexto: Any, captions: list) -> dict:
    """O props.json da camada do short, já com as heranças resolvidas.

    `contexto` é o `_ContextoRender` do `render_short` (cenas, gancho, cor,
    fonte e lugar da legenda, duração).
    """
    return {
        "cenas": contexto.cenas,
        "gancho": contexto.gancho,
        "captions": captions,
        # D-563: a cor da palavra corrente. Vazio = o acento do canal,
        # resolvido pelo renderer — o backend nao conhece a paleta dele.
        "legendaCor": contexto.legenda_cor,
        "legendaFonte": contexto.legenda_fonte,
        # D-605: onde a legenda senta, JA com a heranca resolvida. O
        # renderer nao conhece a cascata — recebe onde desenhar, e os
        # defaults sao os numeros que estavam cravados nele, entao um
        # short gravado antes desta demanda sai igual.
        "legendaLugar": contexto.legenda_lugar,
        # D-913: contorno (o de sempre) ou só sombra — escolha do canal.
        "legendaEstilo": palco_componentes.ler().estilo_da_legenda,
        "duracaoSeg": contexto.duracao_seg,
    }

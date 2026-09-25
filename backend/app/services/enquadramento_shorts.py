"""Enquadrar o short pelo rosto de quem fala (D-477).

Orquestra três peças que já existiam separadas: onde está o bruto, quais
instantes amostrar (`domain/enquadramento_rosto`) e quem detecta
(`infrastructure/detector_rosto`).

## Por que o resultado é APLICADO, e não só sugerido

O foco horizontal é um número entre 0 e 1 — não há como julgá-lo lendo. O
operador julga vendo a janela 9:16 se mover sobre o quadro, e para ver isso o
valor precisa estar gravado. Desfazer é um clique nos botões de foco que já
existem; conferir uma sugestão não aplicada seria trabalho sem tela.

Quando o detector não acha, nada é gravado. Escrever 0.5 ali seria indistinguível
de uma decisão, e o operador concluiria que o detector "achou que era no meio".
"""

from __future__ import annotations

import logging

from app.database import AsyncSessionLocal
from app.domain.short import segmentos_short
from app.domain.short.enquadramento_rosto import Enquadramento, decidir, instantes
from app.infrastructure.detector_rosto import DeteccaoIndisponivel, detectar_nos_instantes
from app.models import Corte, Short

logger = logging.getLogger(__name__)

# Quantos quadros amostrar da janela do short.
#
# Doze é o ponto em que a mediana já é estável e o custo ainda é de um clique:
# medido em ~160ms por quadro num bruto 1080p, dá menos de dois segundos. Vinte
# e quatro não moveram a resposta nos testes; seis deixaram a mediana pular
# quando a pessoa gesticulava na frente do rosto.
QUADROS_AMOSTRADOS = 12


async def enquadrar_pelo_rosto(short_id: str) -> dict:
    """Detecta o rosto no trecho e grava o foco horizontal.

    Levanta `LookupError` (short/corte inexistente) e `ValueError` (sem bruto em
    disco, ou janela inválida). `DeteccaoIndisponivel` sobe como está — é falha
    de ambiente, não do trecho, e merece uma mensagem diferente na tela.
    """
    from app.services.render.render_short import _bruto_em_disco
    from app.services.shorts import _serializar

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        inicio, fim = float(short.inicio_seg), float(short.fim_seg)
        if fim <= inicio:
            raise ValueError("O short tem intervalo vazio ou invertido.")
        # Lido DENTRO da sessao: o `short` nao sobrevive a ela, e ler o atributo
        # depois do `async with` dispararia um lazy load numa sessao fechada.
        segmentos_json = short.segmentos

        bruto = _bruto_em_disco(corte)
        if bruto is None:
            raise ValueError(
                "O bruto deste corte nao esta mais em disco — sem ele nao da para olhar o rosto."
            )

    # D-604: os instantes saem do tempo do SHORT e sao traduzidos para o bruto.
    #
    # Amostrar ao longo de `[inicio, fim]` cairia DENTRO DO BURACO num short
    # colado — quadros do material que o operador tirou fora, onde a pessoa pode
    # estar noutro lugar do enquadramento ou nem aparecer. O foco sairia
    # enviesado por um trecho que o arquivo nao contem.
    #
    # Sem colagem a conta e identica a de antes: `no_bruto(t)` vira
    # `inicio + t`, e `instantes(0, fim - inicio, N)` mapeado da exatamente os
    # mesmos numeros que `instantes(inicio, fim, N)` dava.
    fatias = segmentos_short.de_json(segmentos_json)
    duracao = segmentos_short.duracao_liquida(fatias, inicio_seg=inicio, fim_seg=fim)
    momentos = [
        segmentos_short.no_bruto(instante, fatias, inicio_seg=inicio, fim_seg=fim)
        for instante in instantes(0.0, duracao, QUADROS_AMOSTRADOS)
    ]
    quadros = await detectar_nos_instantes(bruto, momentos)
    veredito = decidir(quadros)

    if veredito.achou:
        async with AsyncSessionLocal() as db:
            short = await db.get(Short, short_id)
            short.foco_x = round(float(veredito.foco_x), 3)
            await db.commit()
            serializado = _serializar(short)
    else:
        async with AsyncSessionLocal() as db:
            serializado = _serializar(await db.get(Short, short_id))

    logger.info(
        "[Rosto] short=%s foco=%s (%s)",
        short_id[:8],
        veredito.foco_x,
        veredito.motivo,
    )
    return {"short": serializado, **_descrever(veredito)}


def _descrever(veredito: Enquadramento) -> dict:
    """O veredito em forma de resposta, com o AVISO junto quando cabe.

    `pessoa_se_move` não impede o enquadramento — um ponto fixo ainda é melhor
    que o centro. Mas cala-lo faria o operador culpar o detector por um vídeo em
    que a pessoa realmente andou de um lado para o outro.
    """
    return {
        "achou": veredito.achou,
        "foco_x": veredito.foco_x,
        "motivo": veredito.motivo,
        "quadros_analisados": veredito.quadros_analisados,
        "quadros_com_rosto": veredito.quadros_com_rosto,
        "aviso": (
            "A pessoa se move bastante neste trecho — um foco fixo é um meio-termo."
            if veredito.pessoa_se_move
            else ""
        ),
    }


__all__ = ["DeteccaoIndisponivel", "QUADROS_AMOSTRADOS", "enquadrar_pelo_rosto"]

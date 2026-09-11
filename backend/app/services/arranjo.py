"""Operações de ordem dos blocos de um corte (D-576).

O que este serviço faz é só isto: carregar o arranjo do corte, aplicar uma
operação PURA de `domain/arranjo_blocos.py`, reconciliar com as bordas atuais,
validar e gravar. Toda a regra vive no domínio; aqui mora a transação e a
decisão de quando a transcrição precisa ser refeita.

**Artefato já gerado não é apagado.** Reordenar invalida o bruto, a grade, os
overlays — mas o contrato desta casa (o mesmo de editar a borda ou dividir o
corte) é avisar, não destruir: o editor regenera quando quiser. O campo
`bruto_desatualizado` na resposta é esse aviso.
"""

from __future__ import annotations

import json

from app.database import AsyncSessionLocal
from app.domain import arranjo_blocos as dominio
from app.domain.segment_calculator import mesclar_desvios_sobrepostos, normalizar_desvio
from app.models import Corte
from app.services.app_logging import operational_error


class ArranjoInvalidoError(ValueError):
    """O resultado da operação quebraria a invariante de permutação."""


def _desvios_do_corte(corte: Corte) -> list[dict]:
    try:
        brutos = json.loads(corte.desvios or "[]")
    except json.JSONDecodeError:
        operational_error("ArranjoService", f"desvios do corte {corte.id} corrompidos; ignorando.")
        return []
    return mesclar_desvios_sobrepostos([normalizar_desvio(d) for d in brutos])


def _resposta(
    corte_id: str,
    inicio: float,
    fim: float,
    blocos: list[dominio.Bloco],
    desvios: list[dict],
    bruto_desatualizado: bool,
) -> dict:
    """Payload que a UI precisa para desenhar a fila de blocos.

    Recebe valores já lidos do corte em vez do objeto: montar a resposta depois
    do `commit` tocaria atributos expirados, e em SQLAlchemy async um refresh
    preguiçoso desses estoura `MissingGreenlet` em vez de recarregar.
    """
    efetivos = blocos or dominio.bloco_unico(inicio, fim)
    return {
        "corte_id": corte_id,
        "inicio_seg": inicio,
        "fim_seg": fim,
        "blocos": [
            {
                "posicao": posicao,
                "inicio_seg": bloco.inicio_seg,
                "fim_seg": bloco.fim_seg,
                "duracao_seg": bloco.duracao_seg,
                # Duração que sobra depois dos desvios DESTE bloco — é o que o
                # editor vê no vídeo, e sem ela a soma da fila não bateria com a
                # duração do bruto num corte cheio de silêncio removido.
                "duracao_liquida_seg": dominio.duracao_liquida(bloco, desvios),
            }
            for posicao, bloco in enumerate(efetivos)
        ],
        "cronologico": dominio.eh_cronologico(blocos),
        "bruto_desatualizado": bruto_desatualizado,
    }


async def _aplicar(corte_id: str, operacao) -> dict:
    """Roda `operacao(blocos, inicio, fim)` sobre o arranjo do corte e persiste.

    A transcrição final só é refeita quando a fila de segmentos REALMENTE mudou.
    Dividir um bloco sem movê-lo não muda um frame do vídeo (os pedaços vizinhos
    são costurados de volta em `segmentos_na_ordem`), e re-sincronizar à toa
    custaria uma varredura da transcrição inteira a cada clique.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado.")

        inicio = float(corte.inicio_seg or 0.0)
        fim = float(corte.fim_seg or 0.0)
        desvios = _desvios_do_corte(corte)

        atual = dominio.reconciliar(dominio.parse(corte.arranjo_blocos), inicio, fim)
        antes = dominio.segmentos_na_ordem(atual, inicio, fim, desvios)

        novo = dominio.reconciliar(operacao(atual, inicio, fim), inicio, fim)
        erros = dominio.validar(novo, inicio, fim)
        if erros:
            raise ArranjoInvalidoError("; ".join(erros))

        depois = dominio.segmentos_na_ordem(novo, inicio, fim, desvios)
        mudou = depois != antes

        corte.arranjo_blocos = json.dumps(dominio.serializar(novo), ensure_ascii=False)
        bruto_ja_existe = bool((corte.arquivo_clip_path or "").strip())
        resposta = _resposta(
            corte_id, inicio, fim, novo, desvios, bruto_desatualizado=mudou and bruto_ja_existe
        )
        await db.commit()

    if mudou:
        # Fora da transação, como todo o resto do projeto faz: a sincronização
        # abre a própria sessão e é pesada demais para segurar a escrita.
        from app.services.corte import CorteService

        await CorteService.sincronizar_transcricao_corte(corte_id)

    return resposta


async def obter(corte_id: str) -> dict:
    """A fila de blocos como está hoje — sem escrever nada."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado.")
        inicio = float(corte.inicio_seg or 0.0)
        fim = float(corte.fim_seg or 0.0)
        blocos = dominio.reconciliar(dominio.parse(corte.arranjo_blocos), inicio, fim)
        return _resposta(
            corte_id, inicio, fim, blocos, _desvios_do_corte(corte), bruto_desatualizado=False
        )


async def dividir(corte_id: str, ponto_seg: float) -> dict:
    """Passa a lâmina no instante absoluto `ponto_seg`, criando uma junta."""
    return await _aplicar(
        corte_id, lambda blocos, inicio, fim: dominio.dividir(blocos, ponto_seg, inicio, fim)
    )


async def fundir(corte_id: str, indice: int) -> dict:
    """Desfaz a junta entre o bloco `indice` e o vizinho seguinte na live."""
    return await _aplicar(corte_id, lambda blocos, _inicio, _fim: dominio.fundir(blocos, indice))


async def mover(corte_id: str, de_indice: int, para_indice: int) -> dict:
    """Move o bloco da posição `de_indice` para `para_indice` na fila."""
    return await _aplicar(
        corte_id, lambda blocos, _inicio, _fim: dominio.mover(blocos, de_indice, para_indice)
    )


async def restaurar(corte_id: str) -> dict:
    """Volta à ordem da live, esquecendo blocos e ordem — o botão de desistir."""
    return await _aplicar(corte_id, lambda _blocos, _inicio, _fim: [])

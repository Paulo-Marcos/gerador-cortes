"""Riscar o corte: o "Rejeitar" que guarda o trabalho e solta a mídia (D-1088).

Antes o "Rejeitar" do editor excluía o corte: a proposta da IA, as bordas, os
trechos e as cenas que o operador acertou iam junto com a linha. Riscado, o
corte fica no banco com `status = rejeitado`; a mídia pesada sai como no Limpar
(D-598), e o snapshot da proposta ganha a data e o motivo, como no apagar
(D-993), para a telemetria contar o riscado como apagado.

A ordem segue a ADR-0016: o status e o snapshot gravam numa transação curta; a
mídia sai depois, numa thread (bruto, grade e overlays somam GB, D-645); uma
segunda transação só esquece o caminho do bruto que deixou de existir.

A volta é uma só, `trazer_de_volta`: o Desfazer do aviso do editor e a seção
Riscados da lista de cortes (D-1092) chamam a mesma rota.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.corte import ciclo_corte
from app.models import Corte, StatusCorte
from app.services import bruto_do_corte, proposta_apagada
from app.services.media_retention import MediaRetentionService


@dataclass(frozen=True)
class CorteTrazidoDeVolta:
    corte_id: str
    status: str
    # Se o bruto já está sendo gerado de novo; falso quando não havia o que gerar
    # (o riscar não soltou bruto) ou quando a geração foi recusada agora.
    gerando_bruto: bool


@dataclass(frozen=True)
class CorteRiscado:
    corte_id: str
    status_anterior: str
    liberado_mb: float
    retido_mb: float


async def riscar(corte_id: str, motivo: str | None = None) -> CorteRiscado:
    """Risca o corte e solta a mídia dele (RN-04, RN-15). A linha do `Corte` fica.

    Recusa o corte que já está no YouTube: o vídeo no ar conta como entregue.
    """
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if corte is None:
            raise NaoEncontrado("Corte não encontrado")
        anterior = getattr(corte.status, "value", corte.status)
        ciclo_corte.validar_riscar(anterior, no_youtube=bool(corte.youtube_video_id))
        if anterior != ciclo_corte.REJEITADO:
            # Riscar de novo (o chip do motivo) não apaga a etapa de onde ele saiu.
            corte.status_antes_de_riscar = anterior
        corte.status = StatusCorte.REJEITADO
        proposta_apagada.registrar_riscado(corte, motivo)
        tinha_bruto = bool(corte.arquivo_clip_path)

    relatorio = await asyncio.to_thread(MediaRetentionService.limpar_corte, corte)
    if tinha_bruto and not corte.arquivo_clip_path:
        await _anotar_o_bruto_solto(corte_id)
    return CorteRiscado(
        corte_id=corte_id,
        status_anterior=anterior,
        liberado_mb=relatorio.liberado_mb,
        retido_mb=relatorio.retido_mb,
    )


async def trazer_de_volta(corte_id: str) -> CorteTrazidoDeVolta:
    """Traz o corte riscado de volta: a etapa de antes, fora da conta de apagados,
    e o bruto gerado de novo, sem pedir o clique (D-1088, RN-04).

    É a volta dos dois lugares: o Desfazer do aviso do editor e a seção Riscados
    da lista de cortes (D-1092). O bruto só se gera se o riscar o soltou; a
    geração preserva as cenas já feitas (`bruto_do_corte.iniciar_geracao`, D-160).
    """
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if corte is None:
            raise NaoEncontrado("Corte não encontrado")
        novo = ciclo_corte.status_ao_trazer_de_volta(
            getattr(corte.status, "value", corte.status), corte.status_antes_de_riscar or ""
        )
        corte.status = StatusCorte(novo)
        regerar = bool(corte.bruto_solto_ao_riscar)
        corte.status_antes_de_riscar = ""
        corte.bruto_solto_ao_riscar = False
        proposta_apagada.desfazer_riscado(corte)

    gerando = regerar and await _gerar_o_bruto_de_novo(corte_id)
    return CorteTrazidoDeVolta(corte_id=corte_id, status=novo, gerando_bruto=gerando)


async def _gerar_o_bruto_de_novo(corte_id: str) -> bool:
    """O corte já voltou; uma recusa do bruto agora (cenas em geração) não o desfaz."""
    try:
        await bruto_do_corte.iniciar_geracao(corte_id)
    except PedidoInvalido:
        return False
    return True


async def _anotar_o_bruto_solto(corte_id: str) -> None:
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if corte is not None:
            corte.arquivo_clip_path = ""
            corte.bruto_solto_ao_riscar = True

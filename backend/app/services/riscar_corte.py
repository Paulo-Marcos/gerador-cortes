"""Riscar o corte: o "Rejeitar" que guarda o trabalho e solta a mídia (D-1088).

Antes o "Rejeitar" do editor excluía o corte: a proposta da IA, as bordas, os
trechos e as cenas que o operador acertou iam junto com a linha. Riscado, o
corte fica no banco com `status = rejeitado`; a mídia pesada sai como no Limpar
(D-598), e o snapshot da proposta ganha a data e o motivo, como no apagar
(D-993), para a telemetria contar o riscado como apagado.

A ordem segue a ADR-0016: o status e o snapshot gravam numa transação curta; a
mídia sai depois, numa thread (bruto, grade e overlays somam GB, D-645); uma
segunda transação só esquece o caminho do bruto que deixou de existir.

A volta é uma só (`_desfazer_o_riscar`). Chegam a ela a rota `trazer_de_volta`,
do Desfazer do aviso do editor e da seção Riscados (D-1092), e o PATCH ou o
/aprovar que tiram o corte do riscado (o A do editor, o Voltar do Workspace),
por `voltar_se_riscado`. Por qualquer porta, voltar limpa o snapshot de apagado
e gera de novo o bruto que o riscar soltou.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.corte import ciclo_corte
from app.models import Corte, StatusCorte
from app.services import bruto_do_corte, proposta_apagada
from app.services.export import ExportService
from app.services.media_retention import MediaRetentionService
from app.services.render.render_progress import RenderProgressStore


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
    # A mídia que não saiu (arquivo em uso no Windows): o aviso diz o que ficou,
    # em vez de só "X MB liberados".
    nao_removidos: list[str]


async def riscar(corte_id: str, motivo: str | None = None) -> CorteRiscado:
    """Risca o corte e solta a mídia dele (RN-04, RN-15). A linha do `Corte` fica.

    Recusa o corte que já está no YouTube (o vídeo no ar conta como entregue) e o
    que tem trabalho em curso: o bruto que termina depois gravaria a mídia de novo
    num corte riscado, e o render perderia a grade e os overlays no meio.
    """
    _recusar_trabalho_em_curso(corte_id)
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
        bruto = corte.arquivo_clip_path

    relatorio = await asyncio.to_thread(MediaRetentionService.limpar_corte, corte)
    if bruto and not corte.arquivo_clip_path:
        await _anotar_o_bruto_solto(corte_id, bruto)
    return CorteRiscado(
        corte_id=corte_id,
        status_anterior=anterior,
        liberado_mb=relatorio.liberado_mb,
        retido_mb=relatorio.retido_mb,
        nao_removidos=[*relatorio.erros, *relatorio.pulados],
    )


def _recusar_trabalho_em_curso(corte_id: str) -> None:
    if ExportService.get_tarefa_corte_status(corte_id) == "cortando":
        raise PedidoInvalido("O bruto deste corte está sendo gerado: espere terminar para riscar.")
    if RenderProgressStore.is_running(corte_id):
        raise PedidoInvalido("O render deste corte está rodando: espere terminar para riscar.")


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
        regerar = _desfazer_o_riscar(corte)
        novo = getattr(corte.status, "value", corte.status)

    gerando = await gerar_o_bruto_se_solto(corte_id, regerar)
    return CorteTrazidoDeVolta(corte_id=corte_id, status=novo, gerando_bruto=gerando)


def voltar_se_riscado(corte: Corte, pedido: str) -> bool:
    """O PATCH e o /aprovar que tiram o corte do riscado passam pela mesma volta.

    Chamar na transação do pedido, depois de validá-lo; o status pedido vale (o A
    pede aprovado, o Voltar do Workspace pede proposto). Devolve se o bruto que o
    riscar soltou precisa ser gerado: chamar `gerar_o_bruto_se_solto` depois do
    commit (ADR-0016). Corte que não está riscado não muda.
    """
    if getattr(corte.status, "value", corte.status) != ciclo_corte.REJEITADO:
        return False
    regerar = _desfazer_o_riscar(corte)
    corte.status = StatusCorte(pedido)
    return regerar


def _desfazer_o_riscar(corte: Corte) -> bool:
    """A volta única: a etapa de antes, fora da conta de apagados (RN-05).

    Devolve se o riscar soltou um bruto que precisa ser gerado de novo.
    """
    novo = ciclo_corte.status_ao_trazer_de_volta(
        getattr(corte.status, "value", corte.status), corte.status_antes_de_riscar or ""
    )
    corte.status = StatusCorte(novo)
    regerar = bool(corte.bruto_solto_ao_riscar)
    corte.status_antes_de_riscar = ""
    corte.bruto_solto_ao_riscar = False
    proposta_apagada.desfazer_riscado(corte)
    return regerar


async def gerar_o_bruto_se_solto(corte_id: str, solto: bool) -> bool:
    """Gera de novo o bruto que o riscar soltou; devolve se a geração começou.

    O corte já voltou: uma recusa do bruto agora (cenas em geração) não o desfaz.
    """
    if not solto:
        return False
    try:
        await bruto_do_corte.iniciar_geracao(corte_id)
    except PedidoInvalido:
        return False
    return True


async def _anotar_o_bruto_solto(corte_id: str, bruto: str) -> None:
    """Esquece o caminho do bruto que saiu, se ninguém gravou outro no meio."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if corte is not None and corte.arquivo_clip_path == bruto:
            corte.arquivo_clip_path = ""
            corte.bruto_solto_ao_riscar = True

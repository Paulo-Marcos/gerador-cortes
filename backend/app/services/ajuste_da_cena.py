"""O pedido de ajuste de uma cena à IA, que devolve a proposta (D-1074, RN-40).

Reaproveita o caminho da geração das cenas, sem um caminho de IA novo: o mesmo scaffold
de cenas do canal (com as legendas em volta da cena no lugar da transcrição inteira), a
mesma skill `cenas-expert` do canal, o mesmo provedor e a mesma conversão da resposta.
O que muda é o bloco que vai depois do scaffold (a cena e o pedido) e a etapa na
telemetria, que conta o ajuste à parte.

Aceitar a proposta é em `origem_das_cenas.aceitar_cena_ajustada`, com a guarda do plano.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, replace

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.compartilhado.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.corte.ajuste_da_cena import (
    AJUSTE_FORA_DO_CORTE,
    AJUSTE_SEM_CENA,
    CENA_FORA_DO_PLANO,
    ETAPA_DO_AJUSTE,
    achar_a_cena,
    bloco_do_pedido,
    completar_com_a_enviada,
    janela_de_legendas,
    manteve_o_tempo,
    mesclar_o_ajuste,
    provider_do_ajuste,
    recusa_do_ajuste,
)
from app.domain.corte.corte_mapper import (
    cenas_fora_do_corte,
    extrair_cenas_remotion,
    normalizar_cena_remotion,
)
from app.domain.corte.rodada_das_cenas import versao_das_rodadas
from app.infrastructure.gerador_ia import gerador_para
from app.models import Corte
from app.services import cenas_remotion
from app.services.canal import editorial_skills
from app.services.cancelamento_jobs import TrabalhoEmVoo
from app.services.cenas_em_geracao import reservar_o_ajuste
from app.services.claude_ia import _pedido, registrar_skill_usada

_SKILL_CENAS = "cenas-expert"
AJUSTE_CANCELADO = "Ajuste cancelado. A cena ficou como estava."
PEDIDO_VAZIO = "Diga o que mudar na cena."

# O que o card guarda da cena e a IA não precisa ler para ajustar o conteúdo: o visual do
# card, o retrato e as âncoras. O que a IA não devolve fica como estava (`mesclar_o_ajuste`).
_FORA_DO_PEDIDO = frozenset(
    {
        "layout_card",
        "modelo_cena",
        "sombra_nivel",
        "retrato_url",
        "textura",
        "ancoraLegendas",
        "mascotPosicao",
        "mascotTamanho",
    }
)
_CONTEUDO_DA_CENA = tuple(
    campo
    for campo in (
        *cenas_remotion.CAMPOS_SIMPLES_DA_CENA,
        *cenas_remotion.CAMPOS_DO_MASCOTE_NA_CENA,
        *cenas_remotion.LISTAS_DA_CENA,
    )
    if campo not in _FORA_DO_PEDIDO
)


def job_do_ajuste(corte_id: str) -> str:
    """O id com que a tela cancela o ajuste em voo, pela rota da fila global (D-426)."""
    return f"ajuste:{corte_id}"


@dataclass(frozen=True)
class _PedidoLido:
    """O que o pedido leu do plano, antes de a IA começar."""

    versao: str
    provider: ProviderIA
    antes: dict
    enviada: dict
    prompt: str
    granular: list
    dur_bruta: float


async def pedir_ajuste(corte_id: str, tipo: str, inicio: float, pedido: str) -> dict:
    """A proposta da IA para a cena `tipo` + `inicio`: o antes, o depois e a versão do plano.

    Não grava nada. Segura a marca das cenas do corte enquanto a IA trabalha: a geração do
    plano espera, e o ajuste espera a geração. Cancelável pelo id `job_do_ajuste`: cancelar
    a task mata o `claude -p` no ponto da D-1045, e o pedido responde que foi cancelado.
    """
    if not pedido.strip():
        raise PedidoInvalido(PEDIDO_VAZIO)
    with reservar_o_ajuste(corte_id):
        tarefa = asyncio.create_task(_propor(corte_id, tipo, inicio, pedido))
        TrabalhoEmVoo.registrar(job_do_ajuste(corte_id), tarefa)
        try:
            return await tarefa
        except asyncio.CancelledError:
            if _quem_espera_foi_cancelado():
                raise
            raise PedidoInvalido(AJUSTE_CANCELADO) from None


def _quem_espera_foi_cancelado() -> bool:
    """Distingue o cancelamento do ajuste (a task dele) do da própria requisição."""
    atual = asyncio.current_task()
    return bool(atual and atual.cancelling())


async def _propor(corte_id: str, tipo: str, inicio: float, pedido: str) -> dict:
    lido = await _ler_o_pedido(corte_id, tipo, inicio, pedido)
    skill = editorial_skills.resolver_skill(_SKILL_CENAS)
    registrar_skill_usada(_SKILL_CENAS, skill)
    pedido_ia = replace(_pedido(skill, _SKILL_CENAS, corte_id=corte_id), etapa=ETAPA_DO_AJUSTE)
    resposta = await gerador_para(lido.provider).gerar_json(lido.prompt, pedido_ia)
    return {
        "versao": lido.versao,
        "provider": lido.provider,
        "antes": lido.antes,
        "depois": _cena_ajustada(lido, resposta),
    }


async def _ler_o_pedido(corte_id: str, tipo: str, inicio: float, pedido: str) -> _PedidoLido:
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado")
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        indice = achar_a_cena(cenas, tipo, inicio)
        if indice is None:
            raise PedidoInvalido(CENA_FORA_DO_PLANO)
        recusa = recusa_do_ajuste(cenas[indice])
        if recusa:
            raise PedidoInvalido(recusa)
        transcricao = json.loads(corte.transcricao_final or "[]")
        if not transcricao:
            raise PedidoInvalido("Transcrição final vazia: sincronize o corte antes.")
        antes = normalizar_cena_remotion(cenas[indice])
        granular = cenas_remotion.CenasRemotionService._get_granular(transcricao)
        granular, mapa = await cenas_remotion.CenasRemotionService._resolver_diarizacao(
            db, corte, granular, None
        )
        start_leg, janela = janela_de_legendas(granular, antes["inicio"], antes["fim"])
        enviada = _cena_para_a_ia(antes, start_leg)
        texto = cenas_remotion._texto_da_parte(corte, janela, 0, 1, mapa)
        return _PedidoLido(
            versao=versao_das_rodadas(corte.cenas_remotion, corte.cenas_anteriores),
            provider=provider_do_ajuste(corte.cenas_origem),
            antes=antes,
            enviada=enviada,
            prompt=pedir_resposta_json_em_bloco_codigo(texto + bloco_do_pedido(enviada, pedido)),
            granular=granular,
            dur_bruta=(corte.fim_seg or 0) - (corte.inicio_seg or 0),
        )


def _cena_para_a_ia(cena: dict, start_leg: int) -> dict:
    """A cena no formato da resposta da geração: a legenda, a duração e o conteúdo."""
    conteudo = {campo: cena[campo] for campo in _CONTEUDO_DA_CENA if cena.get(campo) is not None}
    duracao = round(cena["fim"] - cena["inicio"], 2)
    return {"tipo": cena.get("tipo"), "startLeg": start_leg, "duracao_s": duracao, **conteudo}


def _cena_ajustada(lido: _PedidoLido, resposta: object) -> dict:
    """A cena que a IA devolveu, convertida como as da geração e mesclada na original."""
    devolvidas = extrair_cenas_remotion(resposta) if isinstance(resposta, dict) else []
    devolvida = next((cena for cena in devolvidas if isinstance(cena, dict)), None)
    if devolvida is None:
        raise PedidoInvalido(AJUSTE_SEM_CENA)
    devolvida = completar_com_a_enviada(lido.enviada, devolvida)
    try:
        [convertida] = cenas_remotion.CenasRemotionService._converter_startleg(
            [devolvida], lido.granular
        )
    except (TypeError, ValueError) as erro:
        raise PedidoInvalido(AJUSTE_SEM_CENA) from erro
    depois = mesclar_o_ajuste(
        lido.antes,
        convertida,
        devolvida,
        manteve_o_tempo=manteve_o_tempo(lido.enviada, devolvida),
    )
    if cenas_fora_do_corte([depois], lido.dur_bruta):
        raise PedidoInvalido(AJUSTE_FORA_DO_CORTE)
    return depois

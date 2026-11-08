"""Rotas das gerações por IA (Claude CLI e Antigravity; ver ADR-0004).

Mantidas num router próprio para não tocar nos routers de domínio existentes
(projetos/cortes/metadados), que estão sob lock. Cada rota apenas delega para
`ClaudeIaService` e roda em background quando a operação é longa.
"""

import logging
from typing import Any

from app.database import get_db
from app.domain.compartilhado.erros import ErroDeDominio
from app.domain.compartilhado.provider_ia import provider_do_modelo
from app.models import Corte, Projeto
from app.routers.resposta_api import RespostaApi
from app.services import ajuste_da_cena, telemetria_ia
from app.services.analise import AnaliseService
from app.services.bruto_do_corte import recusar_cenas_com_bruto_em_andamento
from app.services.cenas_em_geracao import esta_gerando
from app.services.cenas_remotion import CenasRemotionService
from app.services.claude_ia import ProviderIA
from app.services.corte import CorteService
from app.services.metadados import MetadadosService
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


async def _soltar_a_transacao(db: AsyncSession) -> None:
    """Encerra a transação de leitura ANTES de chamar a IA (D-652).

    Um `db.get` abre transação no SQLite e ela só fecha no fim da requisição —
    que aqui dura MINUTOS, o tempo de a IA pensar. Enquanto isso, a transação
    aberta atrapalha quem precisa escrever (o clássico "database is locked").

    O `rollback` não desfaz nada: estas rotas só leram para validar, e quem
    grava é o serviço, na sessão dele.
    """
    await db.rollback()


# O que cada geração devolve (D-722): a mensagem, o alvo, o provider e o
# resultado do serviço, espalhado na mesma resposta.


class AnaliseViaIaResponse(RespostaApi):
    message: str
    projeto_id: str
    provider: ProviderIA
    total_cortes: int
    pulados_existentes: int
    total_descartados: int


class GeracaoDoCorteResponse(RespostaApi):
    message: str
    corte_id: str
    provider: ProviderIA


class TrechosGeradosResponse(GeracaoDoCorteResponse):
    total_desvios: int
    novos: int
    recusados: int = 0


class CenasGeradasResponse(GeracaoDoCorteResponse):
    total_cenas: int


class GeracaoConcluidaResponse(GeracaoDoCorteResponse):
    ok: bool


class CenasEmGeracaoResponse(RespostaApi):
    corte_id: str
    em_geracao: bool


class AjustarCenaRequest(BaseModel):
    # A cena pela identidade do plano (`tipo` + início), como a conferência a identifica.
    tipo: str
    inicio: float
    pedido: str = Field(min_length=1, max_length=500)


class PropostaDeAjusteResponse(RespostaApi):
    # A `versao` do plano que a IA leu: o Aceitar a devolve, e recusa se o plano mudou.
    versao: str
    provider: ProviderIA
    antes: dict[str, Any]
    depois: dict[str, Any]


@router.post("/projeto/{projeto_id}/analisar", response_model=AnaliseViaIaResponse)
async def analisar_via_claude(
    projeto_id: str,
    usar_diarizacao: bool = True,
    provider: ProviderIA = "claude",
    db: AsyncSession = Depends(get_db),
):
    """Analisa a transcrição via Claude (SÍNCRONO).

    Gera os cortes primeiro e só então substitui os existentes (uma falha não
    apaga os cortes atuais), e encadeia o refazer-transcrição. Síncrono para dar
    feedback direto no front (spinner enquanto roda; erro visível). Em lives
    longas pode levar alguns minutos.

    D-286: `usar_diarizacao` (default True) injeta o rótulo de falante quando o
    projeto já foi diarizado; passe False para analisar ignorando os falantes.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(
            status_code=400,
            detail=(
                "Este projeto não tem transcrição gravada. Use 'Refazer transcrição' "
                "para baixar as legendas do YouTube e então rode a análise."
            ),
        )
    await _soltar_a_transacao(db)
    try:
        resultado = await AnaliseService.analisar_via_claude(
            projeto_id, usar_diarizacao=usar_diarizacao, provider=provider
        )
        return {
            "message": "Análise via IA concluída",
            "projeto_id": projeto_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro na análise via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-trechos", response_model=TrechosGeradosResponse)
async def gerar_trechos_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Regenera os trechos a remover (desvios) de um corte via Claude e
    ressincroniza a transcrição final.

    Síncrono (processa um único corte). Útil quando o usuário quer refazer só
    os cortes de remoção de um corte, sem reanalisar a live inteira.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    await _soltar_a_transacao(db)
    try:
        resultado = await CorteService.gerar_trechos_via_claude(corte_id, provider=provider)
        return {
            "message": "Trechos regerados via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar trechos via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-cenas", response_model=CenasGeradasResponse)
async def gerar_cenas_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Gera as cenas Remotion do corte via Claude (skill cenas-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    await _soltar_a_transacao(db)
    # D-1037: depois da espera, e sem outra até a reserva: decide com o status de agora.
    recusar_cenas_com_bruto_em_andamento(corte_id)
    try:
        resultado = await CenasRemotionService.gerar_cenas_via_claude(corte_id, provider=provider)
        return {
            "message": "Cenas geradas via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ErroDeDominio:
        # D-1037: a recusa da geração duplicada é do tratador global, com a mensagem
        # inteira; o `except Exception` abaixo a transformaria em 500.
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar cenas via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/ajustar-cena", response_model=PropostaDeAjusteResponse)
async def ajustar_cena_via_ia(corte_id: str, body: AjustarCenaRequest):
    """Pede à IA o ajuste de uma cena só e devolve a proposta, sem gravar (D-1074, RN-40).

    O provedor é o que gerou o plano atual. Cancelável pela fila global com o id
    `ajuste:<corte_id>`; aceitar é `POST /api/cortes/{id}/cenas-remotion/ajuste/aceitar`.
    Sem sessão aqui: o serviço lê o corte (404 se não existe) e a solta antes da IA.
    """
    recusar_cenas_com_bruto_em_andamento(corte_id)
    try:
        return await ajuste_da_cena.pedir_ajuste(corte_id, body.tipo, body.inicio, body.pedido)
    except ErroDeDominio:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao ajustar a cena via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/corte/{corte_id}/cenas-em-geracao", response_model=CenasEmGeracaoResponse)
async def consultar_cenas_em_geracao(corte_id: str):
    """Se as cenas deste corte estão sendo geradas agora, pelo clique ou pela cadeia do bruto.

    Rota própria porque o status do projeto só lista os cortes aprovados, e a Pós abre
    também os outros. Lê só memória: a tela pode repetir à vontade.
    """
    return {"corte_id": corte_id, "em_geracao": esta_gerando(corte_id)}


@router.post("/corte/{corte_id}/gerar-metadados", response_model=GeracaoConcluidaResponse)
async def gerar_metadados_via_claude(
    corte_id: str,
    provider: ProviderIA = "claude",
    substituir: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Gera os metadados do corte via Claude (skill metadados-expert).

    Preenche só o que falta; `substituir` é o Regerar explícito (D-1043).
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    await _soltar_a_transacao(db)
    try:
        resultado = await MetadadosService.gerar_metadados_via_claude(
            corte_id, provider=provider, substituir=substituir
        )
        return {
            "message": "Metadados gerados via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ErroDeDominio:
        # D-1043: a recusa da geração duplicada é do tratador global, com a mensagem
        # inteira; o `except Exception` abaixo a transformaria em 500.
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar metadados via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-prompt-thumbnail", response_model=GeracaoConcluidaResponse)
async def gerar_prompt_thumbnail_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Gera o prompt de imagem da thumbnail via Claude (skill thumbnail-prompt-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    await _soltar_a_transacao(db)
    try:
        resultado = await MetadadosService.gerar_prompt_thumbnail_via_claude(
            corte_id, provider=provider
        )
        return {
            "message": "Prompt de thumbnail gerado via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar prompt de thumbnail via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Telemetria das chamadas de IA (D-353)
# --------------------------------------------------------------------------- #
# Montada NESTE router (`/api/claude`, provider Claude) para não exigir registro
# de um router novo em main.py (travado) — e é o lugar semântico: telemetria das
# chamadas do Claude vive ao lado das rotas que as disparam. Somente leitura; a
# gravação acontece de forma não-fatal dentro do próprio client (claude_cli_client).


class LlmCallResponse(RespostaApi):
    """Uma chamada de IA registrada, para a Área de Análises."""

    id: str
    ts: str
    etapa: str | None = None
    model: str | None = None
    projeto_id: str | None = None
    corte_id: str | None = None
    short_id: str | None = None
    prompt: str | None = None
    resposta: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    custo_usd: float | None = None
    duracao_ms_servidor: float | None = None
    latencia_ms_wall: float | None = None
    sucesso: bool
    erro_tipo: str | None = None


class ListaLlmCallsResponse(RespostaApi):
    chamadas: list[LlmCallResponse]


class UltimaGeracaoResponse(RespostaApi):
    """Quem fez a última geração de uma etapa, para o selo na tela."""

    provider: ProviderIA | None = None
    model: str | None = None
    ts: str | None = None


@router.get("/telemetria/ultima-geracao", response_model=UltimaGeracaoResponse)
async def ultima_geracao(
    etapa: str,
    corte_id: str | None = None,
    short_id: str | None = None,
):
    """A última chamada bem-sucedida desta etapa — de onde sai o selo Claude/Gemini.

    Sai da telemetria, e não de uma coluna por entidade: o nome do modelo já é
    gravado a cada chamada. Best-effort por natureza — telemetria é acessória e
    pode faltar; sem registro, a tela simplesmente não mostra selo.
    """
    ultima = telemetria_ia.ultima_geracao_bem_sucedida(
        etapa=etapa, corte_id=corte_id, short_id=short_id
    )
    if ultima is None:
        return UltimaGeracaoResponse()
    return UltimaGeracaoResponse(
        provider=provider_do_modelo(ultima["model"]),
        model=ultima["model"],
        ts=ultima["ts"],
    )


@router.get("/telemetria/llm-calls", response_model=ListaLlmCallsResponse)
async def listar_llm_calls(
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
    etapa: str | None = None,
    limite: int = 100,
):
    """Lista as chamadas de IA registradas (mais recentes primeiro), com filtros
    opcionais por projeto/corte/etapa. Alimenta a aba "Chamadas de IA" em Análises.
    """
    registros = telemetria_ia.listar_llm_calls(
        projeto_id=projeto_id,
        corte_id=corte_id,
        short_id=short_id,
        etapa=etapa,
        limite=max(1, min(limite, 500)),
    )
    return ListaLlmCallsResponse(
        chamadas=[LlmCallResponse(**{**r, "sucesso": bool(r["sucesso"])}) for r in registros]
    )

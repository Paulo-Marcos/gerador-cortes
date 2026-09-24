"""Serviço de análise de padrões dos melhores prompts de thumbnail (D-070).

Fecha o loop de aprendizado da D-066. Lê o histórico de avaliações (reusando o
serviço da D-066 — não duplica acesso a dados), seleciona os pares melhor
avaliados, compila a frequência dos eixos visuais (via domínio puro) e pede a um
agente Claude que interprete o que os melhores têm em comum e proponha um ajuste
para a skill do Capista (`thumbnail-prompt-expert`).

A aplicação do ajuste na skill é deliberadamente manual: o agente só PROPÕE; o
o operador valida os padrões e a edição da SKILL.md é feita em separado, com humano
no loop. Aditivo: não altera o fluxo de geração/avaliação existente.
"""

import json
import logging

from app import prompts_utilitarios
from app.config import settings
from app.domain.compartilhado.gerador_ia import PedidoIA
from app.domain.corte.padroes_thumbnail import (
    MIN_MELHORES_PARA_ANALISE,
    compilar_padroes,
    selecionar_melhores,
)
from app.infrastructure.gerador_ia import gerador_para
from app.provider_ia import ProviderIA
from app.services.avaliacao_thumbnail import AvaliacaoThumbnailService

logger = logging.getLogger(__name__)

# Quantos dos melhores prompts mandar na íntegra para o agente. Os eixos já vêm
# agregados; os prompts inteiros dão contexto sem estourar o tamanho do prompt.
_MAX_PROMPTS_EXEMPLO = 12

# Limite de avaliações lidas do histórico para a análise.
_LIMITE_HISTORICO = 200


def _formatar_eixos(eixos: dict[str, list[dict]]) -> str:
    """Renderiza a frequência por eixo em texto legível para o prompt."""
    linhas: list[str] = []
    for eixo, ocorrencias in eixos.items():
        if not ocorrencias:
            continue
        valores = ", ".join(f'"{o["valor"]}" (x{o["contagem"]})' for o in ocorrencias)
        linhas.append(f"- {eixo}: {valores}")
    return "\n".join(linhas) if linhas else "(nenhum eixo capturado)"


def _formatar_exemplos(melhores: list[dict]) -> str:
    """Renderiza os melhores prompts (com veredito e comentário) para o prompt."""
    blocos: list[str] = []
    for indice, avaliacao in enumerate(melhores[:_MAX_PROMPTS_EXEMPLO], start=1):
        comentario = (avaliacao.get("comentario") or "").strip()
        cabecalho = f"[{indice}] veredito={avaliacao.get('veredito')}"
        if comentario:
            cabecalho += f" | comentário do editor: {comentario}"
        blocos.append(f"{cabecalho}\n{(avaliacao.get('prompt_snapshot') or '').strip()}")
    return "\n\n---\n\n".join(blocos)


def _montar_prompt(padroes: dict, melhores: list[dict]) -> str:
    """Monta o prompt do agente de padrões a partir do template do canal (D-348).

    O invólucro (instrução + contrato de saída) mora no banco por canal, editável
    em /canais; aqui só injetamos os dados computados.
    """
    return prompts_utilitarios.resolver_prompt("padroes-thumbnail").format(
        total_melhores=padroes["total_melhores"],
        com_tags=padroes["com_tags"],
        eixos=_formatar_eixos(padroes["eixos"]),
        exemplos=_formatar_exemplos(melhores),
    )


def _resposta_insuficiente(total: int, melhores: list[dict]) -> dict:
    """Resposta quando ainda não há melhores suficientes para analisar."""
    return {
        "status": "dados_insuficientes",
        "total_avaliacoes": total,
        "total_melhores": len(melhores),
        "minimo": MIN_MELHORES_PARA_ANALISE,
        "padroes": None,
        "analise": None,
    }


async def _ler_padroes(prompt: str, provider: ProviderIA) -> dict:
    """A leitura semântica dos padrões, pelo provider escolhido.

    Esta etapa não tem skill editorial no banco — o prompt nasce aqui —, então o
    modelo do Gemini vem da faixa equivalente ao modelo Claude dela.
    """
    from app.editorial_skills import modelo_gemini_equivalente

    pedido = PedidoIA(
        etapa="padroes-thumbnail",
        modelo=settings.claude_model_metadados,
        modelo_gemini=modelo_gemini_equivalente(settings.claude_model_metadados),
    )
    return await gerador_para(provider).gerar_json(prompt, pedido)


class PadroesThumbnailService:
    @staticmethod
    async def analisar(
        *, limite_historico: int = _LIMITE_HISTORICO, provider: ProviderIA = "claude"
    ) -> dict:
        """Analisa os padrões dos melhores prompts e propõe ajuste na skill.

        Lê o histórico recente, seleciona os melhores, compila a frequência dos
        eixos e delega ao agente Claude a leitura semântica. Quando há poucos
        bons exemplos, devolve `status=dados_insuficientes` sem chamar o agente.
        """
        historico = await AvaliacaoThumbnailService.listar_recentes(limite_historico)
        avaliacoes = historico.get("avaliacoes", [])
        melhores = selecionar_melhores(avaliacoes)

        if len(melhores) < MIN_MELHORES_PARA_ANALISE:
            return _resposta_insuficiente(len(avaliacoes), melhores)

        padroes = compilar_padroes(melhores)
        prompt = _montar_prompt(padroes, melhores)

        try:
            analise = await _ler_padroes(prompt, provider)
        except (ValueError, json.JSONDecodeError):
            logger.exception("Falha ao analisar padrões de thumbnail via IA")
            raise

        return {
            "status": "ok",
            "total_avaliacoes": len(avaliacoes),
            "total_melhores": padroes["total_melhores"],
            "com_tags": padroes["com_tags"],
            "padroes": padroes,
            "analise": analise,
        }

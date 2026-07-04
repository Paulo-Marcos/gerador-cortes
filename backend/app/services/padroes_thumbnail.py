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

from app.config import settings
from app.domain.padroes_thumbnail import (
    MIN_MELHORES_PARA_ANALISE,
    compilar_padroes,
    selecionar_melhores,
)
from app.infrastructure import claude_cli_client
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
    """Monta o prompt inline do agente de padrões (sem skill dedicada)."""
    return (
        "Você é um diretor de arte editorial analisando os prompts de thumbnail "
        "MELHOR AVALIADOS de um canal. O objetivo é "
        "descobrir o que os melhores têm em comum para refinar a skill do "
        "Capista que os gera.\n\n"
        f"Total de melhores avaliados: {padroes['total_melhores']} "
        f"(com linha [VARIATION_TAGS]: {padroes['com_tags']}).\n\n"
        "=== FREQUÊNCIA DOS EIXOS VISUAIS NOS MELHORES ===\n"
        f"{_formatar_eixos(padroes['eixos'])}\n\n"
        "=== PROMPTS DOS MELHORES (na íntegra) ===\n"
        f"{_formatar_exemplos(melhores)}\n\n"
        "=== TAREFA ===\n"
        "Identifique os PADRÕES recorrentes entre os melhores (cenário, elenco, "
        "luz, paleta, tipografia, composição, roupa, escala do mascote, etc.) e "
        "proponha um ajuste objetivo para a skill thumbnail-prompt-expert que "
        "reforce esses padrões sem engessar a variação. Seja concreto e honesto: "
        "se a amostra for pequena ou ruidosa, diga.\n\n"
        "Responda SOMENTE com JSON no formato:\n"
        "{\n"
        '  "resumo": "1-3 frases sobre o que os melhores têm em comum",\n'
        '  "padroes": [\n'
        '    {"eixo": "<eixo>", "padrao": "<o que se repete>", '
        '"evidencia": "<por que/como aparece>", "forca": "alta|media|baixa"}\n'
        "  ],\n"
        '  "proposta_ajuste_skill": "<texto objetivo do ajuste sugerido na skill>"\n'
        "}"
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


class PadroesThumbnailService:
    @staticmethod
    async def analisar(*, limite_historico: int = _LIMITE_HISTORICO) -> dict:
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
            analise = await claude_cli_client.generate_json(
                prompt, model=settings.claude_model_metadados
            )
        except (ValueError, json.JSONDecodeError):
            logger.exception("Falha ao analisar padrões de thumbnail via Claude")
            raise

        return {
            "status": "ok",
            "total_avaliacoes": len(avaliacoes),
            "total_melhores": padroes["total_melhores"],
            "com_tags": padroes["com_tags"],
            "padroes": padroes,
            "analise": analise,
        }

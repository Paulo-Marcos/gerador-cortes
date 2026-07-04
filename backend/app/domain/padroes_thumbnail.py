"""Domínio puro da análise de padrões dos melhores prompts de thumbnail (D-070).

Fecha o loop de aprendizado contínuo da D-066: a partir do histórico de
avaliações (`avaliacoes_thumbnail`), seleciona os pares prompt+imagem melhor
avaliados e extrai o material bruto que um agente vai interpretar — o que os
melhores prompts têm em comum.

A matéria-prima principal é a linha `[VARIATION_TAGS]` que o Capista
(`thumbnail-prompt-expert`) emite no topo de cada prompt: ela já codifica os
eixos visuais escolhidos (cenário, elenco, paleta, luz, tipografia, roupa,
composição…). Aqui só fazemos parsing e contagem determinísticos; a leitura
semântica ("o que isso revela") fica para o agente, fora deste módulo.

É puro: sem FastAPI, SQLAlchemy, HTTP ou cliente externo.
"""

from __future__ import annotations

import re

from app.domain.avaliacao_thumbnail import CRITERIOS, veredito_e_positivo

# Eixos visuais que o Capista declara na linha [VARIATION_TAGS] (SKILL.md §13).
# A ordem é a da própria skill, para a apresentação sair na sequência esperada.
EIXOS: tuple[str, ...] = (
    "cenario",
    "personagens",
    "relacao_mascote_personagens",
    "escala_mascote",
    "camera",
    "pose",
    "paleta",
    "luminosidade",
    "tipografia",
    "roupa",
    "layout_texto",
    "apoio_layout",
)

# Back-compat de LEITURA (E-010): prompts antigos salvaram os eixos do mascote com
# o nome do personagem embutido (`*_sapo`); coalescemos para as chaves neutras ao
# parsear, para a análise de padrões enxergar o histórico antigo e o novo juntos.
_ALIAS_EIXOS_LEGADOS: dict[str, str] = {
    "relacao_sapo_personagens": "relacao_mascote_personagens",
    "escala_sapo": "escala_mascote",
}

# Mínimo de exemplos bons para a análise valer a pena. Abaixo disso, o serviço
# não chama o agente — não há padrão a extrair de uma amostra ínfima.
MIN_MELHORES_PARA_ANALISE = 3

# Peso do veredito ao ordenar os melhores (ótimo vale mais que bom).
_PESO_VEREDITO: dict[str, int] = {"otimo": 2, "bom": 1}

# Captura pares eixo="valor" na linha de tags, tolerando aspas retas ou curvas.
_PAR_TAG = re.compile(r'(\w+)\s*=\s*["“”]([^"“”]*)["“”]')


def parsear_variation_tags(prompt: str | None) -> dict[str, str]:
    """Extrai os eixos da linha `[VARIATION_TAGS]` de um prompt.

    Procura a primeira linha que contém o marcador e devolve `{eixo: valor}`
    apenas para os eixos conhecidos, com valores normalizados (trim). Devolve
    dict vazio quando o prompt não tem a linha (ex.: prompts manuais antigos).
    """
    if not prompt:
        return {}

    linha_tags = ""
    for linha in prompt.splitlines():
        if "[VARIATION_TAGS]" in linha:
            linha_tags = linha
            break
    if not linha_tags:
        return {}

    eixos: dict[str, str] = {}
    for chave, valor in _PAR_TAG.findall(linha_tags):
        chave_norm = chave.strip().lower()
        chave_norm = _ALIAS_EIXOS_LEGADOS.get(chave_norm, chave_norm)  # coalesce legadas
        valor_norm = valor.strip()
        if chave_norm in EIXOS and valor_norm:
            eixos[chave_norm] = valor_norm
    return eixos


def pontuar_avaliacao(avaliacao: dict) -> float:
    """Pontua uma avaliação para ordenar os melhores primeiro.

    Combina o veredito (ótimo > bom) com a média das notas de critério
    informadas. Avaliações só com veredito (sem critérios) ficam ordenadas
    apenas pelo veredito. Quanto maior, melhor.
    """
    veredito = (avaliacao.get("veredito") or "").strip().lower()
    base = _PESO_VEREDITO.get(veredito, 0)

    notas = [
        avaliacao.get(f"nota_{criterio}")
        for criterio in CRITERIOS
        if avaliacao.get(f"nota_{criterio}") is not None
    ]
    media = sum(notas) / len(notas) if notas else 0.0
    return base * 10 + media


def selecionar_melhores(avaliacoes: list[dict], *, limite: int | None = None) -> list[dict]:
    """Filtra os pares melhor avaliados (veredito ótimo/bom), ordenados por nota.

    Mantém só vereditos positivos e que tenham `prompt_snapshot`, ordena do
    melhor para o pior e aplica `limite` quando informado.
    """
    positivos = [
        avaliacao
        for avaliacao in avaliacoes
        if veredito_e_positivo(avaliacao.get("veredito") or "")
        and (avaliacao.get("prompt_snapshot") or "").strip()
    ]
    positivos.sort(key=pontuar_avaliacao, reverse=True)
    if limite is not None:
        return positivos[:limite]
    return positivos


def compilar_padroes(melhores: list[dict]) -> dict:
    """Compila a matéria-prima para o agente a partir dos melhores avaliados.

    Para cada eixo das `[VARIATION_TAGS]`, conta a frequência dos valores entre
    os melhores prompts (do mais comum para o menos), o que dá ao agente um
    sinal concreto do que se repete. Devolve também quantos dos melhores tinham
    a linha de tags (`com_tags`).
    """
    valores_por_eixo: dict[str, dict[str, int]] = {eixo: {} for eixo in EIXOS}
    com_tags = 0

    for avaliacao in melhores:
        tags = parsear_variation_tags(avaliacao.get("prompt_snapshot"))
        if tags:
            com_tags += 1
        for eixo, valor in tags.items():
            contagem = valores_por_eixo[eixo]
            chave = valor.lower()
            contagem[chave] = contagem.get(chave, 0) + 1

    eixos: dict[str, list[dict]] = {}
    for eixo in EIXOS:
        ocorrencias = sorted(valores_por_eixo[eixo].items(), key=lambda item: item[1], reverse=True)
        eixos[eixo] = [{"valor": valor, "contagem": contagem} for valor, contagem in ocorrencias]

    return {
        "total_melhores": len(melhores),
        "com_tags": com_tags,
        "eixos": eixos,
    }

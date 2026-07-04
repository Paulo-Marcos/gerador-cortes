"""Domínio puro da avaliação de thumbnails (D-066).

Regras de validação e agregação das avaliações que o editor dá a cada par
prompt+imagem de thumbnail. É puro: sem FastAPI, SQLAlchemy ou I/O — só decide
o que é uma nota/veredito válido e como resumir um conjunto de avaliações.

O propósito do histórico é alimentar, mais adiante, um agente que olha os
melhores exemplos e procura o que têm em comum. Por isso a agregação aqui já
separa os vereditos positivos e calcula a média por critério.
"""

from __future__ import annotations

# Veredito rápido: o editor pode só dizer "ficou bom" sem detalhar critérios.
VEREDITOS: tuple[str, ...] = ("otimo", "bom", "regular", "ruim")

# Vereditos que marcam o par como um bom exemplo para o agente de padrões.
VEREDITOS_POSITIVOS: frozenset[str] = frozenset({"otimo", "bom"})

# Critérios detalhados, opcionais — derivam das qualidades que a skill
# `thumbnail-prompt-expert` busca: clara, bonita, chamativa e honesta, sempre
# fiel à tese do corte.
CRITERIOS: tuple[str, ...] = (
    "fidelidade",
    "clareza",
    "beleza",
    "impacto",
    "honestidade",
)

NOTA_MIN = 1
NOTA_MAX = 5


def normalizar_veredito(valor: str | None) -> str:
    """Valida e normaliza o veredito rápido (obrigatório).

    Levanta ValueError quando ausente ou fora da lista — o veredito é a única
    informação que sempre precisa existir numa avaliação.
    """
    texto = (valor or "").strip().lower()
    if texto not in VEREDITOS:
        validos = ", ".join(VEREDITOS)
        raise ValueError(f"Veredito inválido: {valor!r}. Use um de: {validos}.")
    return texto


def normalizar_nota(valor: int | None) -> int | None:
    """Valida uma nota de critério (opcional).

    `None` (ou vazio) significa "não avaliei este critério" e é preservado.
    Caso contrário a nota precisa estar entre 1 e 5.
    """
    if valor is None or valor == "":
        return None
    try:
        nota = int(valor)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Nota inválida: {valor!r}.") from exc
    if not NOTA_MIN <= nota <= NOTA_MAX:
        raise ValueError(f"Nota fora do intervalo {NOTA_MIN}-{NOTA_MAX}: {nota}.")
    return nota


def veredito_e_positivo(veredito: str) -> bool:
    """True quando o veredito marca um bom exemplo para o agente de padrões."""
    return veredito.strip().lower() in VEREDITOS_POSITIVOS


def agregar_avaliacoes(avaliacoes: list[dict]) -> dict:
    """Resume um conjunto de avaliações para a tela de histórico.

    Cada item é um dict com `veredito` e, opcionalmente, `nota_<criterio>`.
    Retorna contagens por veredito, total de positivos e a média por critério
    (ignorando os critérios não avaliados). Conjunto vazio devolve zeros.
    """
    total = len(avaliacoes)
    por_veredito: dict[str, int] = {v: 0 for v in VEREDITOS}
    positivos = 0
    somas: dict[str, int] = {c: 0 for c in CRITERIOS}
    contagens: dict[str, int] = {c: 0 for c in CRITERIOS}

    for avaliacao in avaliacoes:
        veredito = (avaliacao.get("veredito") or "").strip().lower()
        if veredito in por_veredito:
            por_veredito[veredito] += 1
        if veredito in VEREDITOS_POSITIVOS:
            positivos += 1
        for criterio in CRITERIOS:
            nota = avaliacao.get(f"nota_{criterio}")
            if nota is None:
                continue
            somas[criterio] += int(nota)
            contagens[criterio] += 1

    medias: dict[str, float | None] = {}
    for criterio in CRITERIOS:
        n = contagens[criterio]
        medias[criterio] = round(somas[criterio] / n, 2) if n else None

    return {
        "total": total,
        "positivos": positivos,
        "por_veredito": por_veredito,
        "medias_criterios": medias,
    }

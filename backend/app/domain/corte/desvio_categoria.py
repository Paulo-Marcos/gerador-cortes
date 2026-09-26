"""Categoria editorial do trecho a remover (D-422).

`origem` diz QUEM marcou o desvio (claude/gemini/manual/tecnico); `categoria`
diz POR QUE ele sai (repetição, tangente, imprecisão…). São eixos
independentes: até o D-422 a UI derivava o badge só da origem, então todo
trecho proposto por IA aparecia com o mesmo rótulo "IA".

Este módulo é o único guardião do vocabulário: o que a skill editorial devolver
fora do conjunto canônico — sinônimo, `tipo` legado do n8n/Gemini, texto livre —
é reconciliado aqui, nunca na UI.
"""

import unicodedata

# Vocabulário canônico. A UI mapeia 1:1 para badge (rótulo + cor).
REPETICAO = "repeticao"
DISFLUENCIA = "disfluencia"
TANGENTE = "tangente"
CHAT = "chat"
ENROLACAO = "enrolacao"
IMPRECISAO = "imprecisao"
TOM = "tom"
SILENCIO = "silencio"
OUTRO = "outro"

CATEGORIAS: tuple[str, ...] = (
    REPETICAO,
    DISFLUENCIA,
    TANGENTE,
    CHAT,
    ENROLACAO,
    IMPRECISAO,
    TOM,
    SILENCIO,
    OUTRO,
)

# Sinônimos aceitos → categoria canônica (chaves já sem acento, minúsculas).
# Cobre o vocabulário da skill, o `tipo` do fluxo manual/Gemini (DESVIO,
# REPETICAO) e as variações que o modelo costuma inventar.
_SINONIMOS: dict[str, str] = {
    "repeticao": REPETICAO,
    "rep": REPETICAO,
    "redundancia": REPETICAO,
    "reiteracao": REPETICAO,
    "disfluencia": DISFLUENCIA,
    "hesitacao": DISFLUENCIA,
    "muleta": DISFLUENCIA,
    "muletas": DISFLUENCIA,
    "gagueira": DISFLUENCIA,
    "falso comeco": DISFLUENCIA,
    "falso-comeco": DISFLUENCIA,
    "falso_comeco": DISFLUENCIA,
    "autocorrecao": DISFLUENCIA,
    "tangente": TANGENTE,
    "desvio": TANGENTE,
    "digressao": TANGENTE,
    "off": TANGENTE,
    "off-topic": TANGENTE,
    "off_topic": TANGENTE,
    "offtopic": TANGENTE,
    "estrutural": TANGENTE,
    "administrativa": TANGENTE,
    "administrativo": TANGENTE,
    "chat": CHAT,
    "interacao chat": CHAT,
    "interacao_chat": CHAT,
    "audiencia": CHAT,
    "enrolacao": ENROLACAO,
    "pausa": ENROLACAO,
    "pausa tecnica": ENROLACAO,
    "imprecisao": IMPRECISAO,
    "impreciso": IMPRECISAO,
    "incorreto": IMPRECISAO,
    "erro": IMPRECISAO,
    "erro factual": IMPRECISAO,
    "factual": IMPRECISAO,
    "duvidoso": IMPRECISAO,
    "tom": TOM,
    "fora do tom": TOM,
    "fora_do_tom": TOM,
    "desabafo": TOM,
    "treta": TOM,
    "silencio": SILENCIO,
    "tecnico": SILENCIO,
    "outro": OUTRO,
}

# Inferência por motivo, para desvios sem `categoria`: legados (persistidos
# antes do D-422) e respostas em que o modelo ignorou o campo. Ordem importa —
# a primeira raiz encontrada no motivo vence, então o mais específico vem antes.
_RAIZES_MOTIVO: tuple[tuple[str, str], ...] = (
    ("silenc", SILENCIO),
    ("impreci", IMPRECISAO),
    ("incorret", IMPRECISAO),
    ("possivelmente errad", IMPRECISAO),
    ("erro factual", IMPRECISAO),
    ("checar", IMPRECISAO),
    ("repet", REPETICAO),
    ("redundan", REPETICAO),
    ("reitera", REPETICAO),
    ("hesita", DISFLUENCIA),
    ("muleta", DISFLUENCIA),
    ("gagueira", DISFLUENCIA),
    ("falso comeco", DISFLUENCIA),
    ("autocorre", DISFLUENCIA),
    ("chat", CHAT),
    ("audiencia", CHAT),
    ("doaca", CHAT),
    ("digress", TANGENTE),
    ("tangente", TANGENTE),
    ("off-topic", TANGENTE),
    ("off topic", TANGENTE),
    ("desvio", TANGENTE),
    ("enrola", ENROLACAO),
    ("pausa tecnica", ENROLACAO),
    ("desabafo", TOM),
    ("treta", TOM),
    ("fora do tom", TOM),
)

# Aviso obrigatório no motivo do trecho impreciso: o operador precisa ver, na
# própria mensagem, que ali há afirmação a conferir — não só na cor do badge.
AVISO_IMPRECISAO = "Possível imprecisão"


def _sem_acento(texto: str) -> str:
    """Minúsculas sem acento, para comparar rótulo do modelo com o vocabulário."""
    normalizado = unicodedata.normalize("NFD", texto.strip().lower())
    return "".join(c for c in normalizado if unicodedata.category(c) != "Mn")


def normalizar_categoria(bruto: str | None, motivo: str = "") -> str:
    """Reconcilia o rótulo do modelo com o vocabulário canônico.

    Prioridade: `bruto` (campo `categoria`/`tipo` da resposta) → inferência pelo
    `motivo` → `OUTRO`. Nunca levanta: categoria desconhecida é ruído editorial,
    não erro de execução.
    """
    chave = _sem_acento(bruto or "")
    if chave in _SINONIMOS:
        return _SINONIMOS[chave]

    # Rótulo composto ("desvio ESTRUTURAL", "repetição de tese"): procura o
    # sinônimo dentro do texto antes de cair na inferência pelo motivo.
    if chave:
        for sinonimo, categoria in _SINONIMOS.items():
            if sinonimo in chave:
                return categoria

    return inferir_categoria_do_motivo(motivo)


def inferir_categoria_do_motivo(motivo: str) -> str:
    """Categoria deduzida do texto do motivo; `OUTRO` quando nada casa."""
    texto = _sem_acento(motivo or "")
    for raiz, categoria in _RAIZES_MOTIVO:
        if raiz in texto:
            return categoria
    return OUTRO


def motivo_com_aviso(motivo: str, categoria: str) -> str:
    """Garante o aviso de imprecisão no motivo do trecho `IMPRECISAO`.

    A skill já é instruída a escrever o aviso; isto fecha o caso em que ela
    classifica certo mas descreve o trecho sem sinalizar a dúvida.
    """
    texto = (motivo or "").strip()
    if categoria != IMPRECISAO:
        return texto
    if "impreci" in _sem_acento(texto):
        return texto
    return f"{AVISO_IMPRECISAO} — {texto}" if texto else AVISO_IMPRECISAO


def classificar_desvio(desvio: dict) -> dict:
    """Devolve o desvio com `categoria` canônica e motivo já avisado.

    Aceita `categoria` (contrato novo) ou `tipo` (fluxo manual/Gemini legado).
    Não muta a entrada e preserva todos os demais campos (âncoras, origem…).
    """
    resultado = dict(desvio)
    motivo = str(resultado.get("motivo") or "")
    categoria = normalizar_categoria(
        resultado.get("categoria") or resultado.get("tipo"),
        motivo,
    )
    resultado["categoria"] = categoria
    resultado["motivo"] = motivo_com_aviso(motivo, categoria)
    return resultado

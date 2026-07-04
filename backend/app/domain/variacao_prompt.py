"""Lentes de variação para diversificar gerações via Claude (meta-prompt dinâmico).

WHY: com a mesma transcrição, o modelo tende a convergir para saídas parecidas.
Sortear uma "lente" editorial por execução e injetá-la no prompt empurra cada
geração para um ângulo diferente — tornando a variação intencional, não apenas
dependente da estocasticidade do modelo. Sem perder o rigor: a lente muda a
moldura, não as regras.

Função pura (sem I/O). `random.choice` é determinístico-mente diverso entre runs.

Bloco THUMBNAIL: a variação aqui NÃO é por sorteio — cenário, pose e roupa
derivam do contexto do corte (sem cardápio). A variação real vem da memória
global das VARIATION_TAGS (o valor de um eixo na capa anterior vira proibido
na próxima) + pressão positiva sobre o eixo que satura (`contar_eixos_modais`).
"""

import random
import re

_LENTES: dict[str, list[str]] = {
    "cortes": [
        "Favoreça títulos que destacam a TESE PROVOCATIVA de cada corte.",
        "Favoreça títulos centrados no CONCEITO-CHAVE de cada corte.",
        "Favoreça títulos que apontam a CONSEQUÊNCIA PRÁTICA do argumento.",
        "Favoreça títulos em forma de PERGUNTA que fisga o espectador.",
    ],
    "cenas": [
        "Dê preferência a cenas de ÊNFASE e CITAÇÃO para marcar os pontos altos.",
        "Dê preferência a FICHAS e FONTES para dar autoridade visual ao ensaio.",
        "Dê preferência a PERGUNTAS DE TRANSIÇÃO, controlando o ritmo entre blocos.",
        "Equilibre os tipos de cena e evite repetir o padrão da última geração.",
    ],
    "metadados": [
        "Explore o ângulo PROVOCATIVO nas opções de título e capa.",
        "Explore o ângulo CONCEITUAL/intelectual.",
        "Explore o ângulo da CONSEQUÊNCIA PRÁTICA do argumento.",
        "Explore o ângulo da PERGUNTA/curiosidade legítima.",
    ],
    # ─── Repertórios de TEXTO — propositalmente VAZIOS ────────────────────
    #
    # WHY: tipografia, layout da manchete e tratamento gráfico do apoio são
    # decisão criativa do agente — qualquer cardápio fixo aqui (mesmo
    # abstrato como "diagonal / vertical / em arco") vira mode collapse: o
    # gerador trata como obrigatório, sai sempre do mesmo jeito. Confirmado
    # em três rodadas seguidas (capas em diagonal amarela; apoio em retângulo
    # vermelho na base; texto diegético virando grafite/placa).
    #
    # As três chaves continuam existindo para que `formatar_repertorio()`
    # retorne string vazia (sem KeyError) e para que os eixos `tipografia`,
    # `layout_texto` e `apoio_layout` continuem MEMORIZADOS via VARIATION_TAGS
    # — ou seja, a variação acontece pela memória global (o que o agente
    # escolheu na capa anterior vira proibido na próxima), NÃO por catálogo
    # injetado no prompt. O agente decide livremente, guiado apenas por
    # princípios (peso, contorno, legibilidade, contraste, overlay puro) e
    # constraints negativos (sem top-bottom paralelo; sem cor de apoio
    # repetida; sem estilo tipográfico igual ao da anterior).
    "thumbnail_texto": [],
    "thumbnail_layout_texto": [],
    "thumbnail_apoio_layout": [],
    # ─── Roupa do mascote — repertório propositalmente VAZIO ──────────────
    #
    # WHY: listar peças concretas ("regata", "moletom", "camisa de linho") é o
    # mesmo mode collapse de tipografia/layout/apoio — o gerador trata a lista
    # como cardápio, ancora nos primeiros itens e repete a MESMA roupa entre
    # capas (4+ capas seguidas com a mesma roupa, reportado). Pior: a lista
    # continha "camisa de linho clara" e "manga dobrada", que a própria TRAVA
    # DE ROUPA do prompt logo depois proibia — cardápio incoerente.
    #
    # A roupa agora nasce do MÉTODO na skill thumbnail-prompt-expert: registro
    # base relaxado/casual (o contraste tema-sério × roupa-informal é a marca)
    # derivado do contexto material/cultural do corte, SEM nomear peça aqui. A
    # variação real vem da memória global (VARIATION_TAGS.roupa da capa
    # anterior vira proibido na próxima) + pressão positiva (eixo modal
    # saturado → polo oposto). Constraints negativos (sem default bege/clara/
    # linho; descrever a roupa exata só no prompt final) vivem na skill.
    "thumbnail_roupa": [],
}


def dica_variacao(tipo: str) -> str:
    """Sorteia uma lente de variação para o tipo informado.

    Retorna '' para tipos sem lentes (ex.: 'trechos', onde a remoção deve ser
    consistente, não variada).

    Exemplo:
        >>> dica_variacao("cortes") in _LENTES["cortes"]
        True
        >>> dica_variacao("trechos")
        ''
    """
    lentes = _LENTES.get(tipo)
    if not lentes:
        return ""
    return random.choice(lentes)


def bloco_variacao(tipo: str) -> str:
    """Formata a lente como um bloco pronto para concatenar no prompt."""
    dica = dica_variacao(tipo)
    if not dica:
        return ""
    return (
        "\n\n=== VARIAÇÃO DESTA EXECUÇÃO (mude o ângulo; não repita execuções anteriores) ===\n"
        f"{dica}\n"
    )


# ─── Repertórios expostos para o meta-prompt do Claude ───────────────────────


def repertorio(tipo: str) -> list[str]:
    """Retorna a lista de opções de um tipo (cópia rasa)."""
    return list(_LENTES.get(tipo, []))


def formatar_repertorio(tipo: str) -> str:
    """Formata o repertório como bullets prontos pro meta-prompt.

    Usado para tipografia/roupa, onde o Claude escolhe um item (não sorteamos)
    — assim ele pode cruzar com a lista de banidos das últimas N capas.
    """
    itens = repertorio(tipo)
    if not itens:
        return ""
    return "\n".join(f"  - {item}" for item in itens)


# ─── VARIATION_TAGS: memória global das últimas N capas ──────────────────────
#
# Cada `prompt_thumbnail` salvo no banco começa com uma linha no formato:
#
#   [VARIATION_TAGS] cenario="X" | pose="Y" | paleta="Z" | tipografia="W" | roupa="V"
#
# O Claude é instruído a emitir essa linha como PRIMEIRA linha do output. Antes
# de mandar o prompt pro gerador de imagem (Gemini Imagen), a linha é removida
# (`strip_variation_tags`). Para gerar uma nova capa, parseamos as tags das
# últimas N capas (cross-projeto) e injetamos os valores como ELEMENTOS
# PROIBIDOS no meta-prompt, garantindo variação real.

TAG_LINE_REGEX = re.compile(
    r"^\[VARIATION_TAGS\]\s*(.+?)$",
    re.MULTILINE,
)
TAG_PAIR_REGEX = re.compile(r'(\w+)\s*=\s*"([^"]*)"')

_EIXOS_TAGS = (
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

# Back-compat de LEITURA (E-010): capas geradas antes da genericização salvaram os
# eixos do mascote com o nome do personagem embutido (`*_sapo`). A leitura coalesce
# a chave legada para a canônica neutra, de modo que a memória global das últimas
# capas (anti-repetição) continua funcionando sobre o histórico antigo. A escrita
# nova já emite as chaves neutras (D-221).
_ALIAS_TAGS_LEGADAS: dict[str, str] = {
    "relacao_sapo_personagens": "relacao_mascote_personagens",
    "escala_sapo": "escala_mascote",
}

# Rótulos legíveis por eixo — usados tanto no bloco de PROIBIDOS quanto na
# pressão positiva (eixos saturados). Fonte única para os dois não divergirem.
_ROTULOS_EIXOS: dict[str, str] = {
    "cenario": "CENÁRIOS",
    "personagens": "ELENCO VISUAL (pessoas reconhecíveis usadas)",
    "relacao_mascote_personagens": "RELAÇÕES mascote × personagens",
    "escala_mascote": "ESCALAS DO MASCOTE (dominante/co-protagonista/secundário/pequeno)",
    "camera": "ENQUADRAMENTOS DE CÂMERA",
    "pose": "POSES",
    "paleta": "PALETAS",
    "luminosidade": "REGISTRO TONAL / LUZ (chave-alta vs chave-baixa, quente vs frio, claro vs escuro)",
    "tipografia": "TIPOGRAFIAS",
    "roupa": "ROUPAS DO MASCOTE",
    "layout_texto": "LAYOUTS DE TEXTO (manchete)",
    "apoio_layout": "TRATAMENTOS DO APOIO/CATEGORIA",
}


def parse_variation_tags(prompt: str) -> dict[str, str]:
    """Extrai os eixos de variação de um prompt salvo.

    Retorna dict vazio se a linha de tags não existir (prompt antigo,
    pré-mudança). Eixos ausentes/quebrados são silenciosamente ignorados.
    """
    if not prompt:
        return {}
    match = TAG_LINE_REGEX.search(prompt)
    if not match:
        return {}
    pares = TAG_PAIR_REGEX.findall(match.group(1))
    tags: dict[str, str] = {}
    for chave, valor in pares:
        chave = _ALIAS_TAGS_LEGADAS.get(chave, chave)  # coalesce chaves legadas
        if valor.strip():
            tags[chave] = valor.strip()
    return {k: v for k, v in tags.items() if k in _EIXOS_TAGS}


def strip_variation_tags(prompt: str) -> str:
    """Remove a linha `[VARIATION_TAGS] ...` do prompt antes do gerador de imagem.

    O Gemini Imagen renderizaria as tags como texto na imagem se elas
    permanecessem. Esta função é idempotente.
    """
    if not prompt:
        return prompt
    return TAG_LINE_REGEX.sub("", prompt, count=1).lstrip()


def coletar_eixos_proibidos(historico_tags: list[dict[str, str]]) -> dict[str, list[str]]:
    """Consolida os eixos usados nas últimas N capas em listas (sem duplicatas).

    Entrada: lista de dicts retornados por `parse_variation_tags` (uma por capa).
    Saída: dict por eixo com a lista de valores usados — pronto pra virar
    "ELEMENTOS PROIBIDOS" no meta-prompt.
    """
    consolidado: dict[str, list[str]] = {eixo: [] for eixo in _EIXOS_TAGS}
    for tags in historico_tags:
        for eixo in _EIXOS_TAGS:
            valor = tags.get(eixo, "").strip()
            if valor and valor not in consolidado[eixo]:
                consolidado[eixo].append(valor)
    return consolidado


def formatar_eixos_proibidos(consolidado: dict[str, list[str]]) -> str:
    """Formata os eixos proibidos como bloco pronto pro meta-prompt do Claude."""
    linhas: list[str] = []
    for eixo, rotulo in _ROTULOS_EIXOS.items():
        valores = consolidado.get(eixo, [])
        if not valores:
            linhas.append(f"  - {rotulo}: (nenhum registrado ainda)")
            continue
        bullets = "\n      • ".join(valores)
        linhas.append(f"  - {rotulo} já usados (NÃO REPITA nem use similar):\n      • {bullets}")
    return "\n".join(linhas)


def contar_eixos_modais(
    historico_tags: list[dict[str, str]], min_repeticoes: int = 2
) -> dict[str, tuple[str, int]]:
    """Identifica, por eixo, o valor DOMINANTE na janela e quantas vezes apareceu.

    WHY: a anti-repetição por PROIBIDOS só evita repetir o valor EXATO. Para
    pressão POSITIVA — "este eixo está saturado, vá para o polo oposto" — é
    preciso a FREQUÊNCIA, que `coletar_eixos_proibidos` descarta ao deduplicar.
    Só entram eixos cujo valor dominante aparece `min_repeticoes`+ vezes —
    saturação real, não variação saudável.
    """
    from collections import Counter

    modais: dict[str, tuple[str, int]] = {}
    for eixo in _EIXOS_TAGS:
        valores = [t.get(eixo, "").strip() for t in historico_tags if t.get(eixo, "").strip()]
        if not valores:
            continue
        valor, contagem = Counter(valores).most_common(1)[0]
        if contagem >= min_repeticoes:
            modais[eixo] = (valor, contagem)
    return modais


def formatar_pressao_positiva(modais: dict[str, tuple[str, int]]) -> str:
    """Formata os eixos saturados como ORDEM de inversão (pressão positiva).

    Não sugere valores novos (isso ancoraria a IA) — apenas aponta o eixo
    saturado e o valor dominante observado no histórico, ordenando o polo
    oposto. Roupa e luminosidade são os mais sensíveis à recorrência.
    """
    if not modais:
        return ""
    linhas: list[str] = []
    for eixo, (valor, contagem) in modais.items():
        rotulo = _ROTULOS_EIXOS.get(eixo, eixo)
        linhas.append(
            f'  - {rotulo}: o valor "{valor}" DOMINA a janela ({contagem}×). '
            "Para esta capa, leve este eixo ao POLO OPOSTO — não basta variar de leve."
        )
    return "\n".join(linhas)

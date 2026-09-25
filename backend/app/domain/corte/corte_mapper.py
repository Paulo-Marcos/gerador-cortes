"""Helpers puros de serialização/normalização de cenas Remotion de um corte.

Domínio puro: sem FastAPI, sem SQLAlchemy, sem HTTP, sem cliente externo —
só dicts, listas e números. Movidos de ``routers/cortes.py`` (D-077) para que
o router fique restrito à tradução HTTP ↔ serviço.
"""

# Com menos cenas que isso, "a maioria no mesmo tempo" não distingue colapso de acaso.
_MINIMO_DE_CENAS_PARA_COLAPSO = 3


def primeiro_numero_valido(*valores: object, fallback: float = 0.0) -> float:
    """Retorna o primeiro valor convertível em float não-NaN; senão, o fallback."""
    for valor in valores:
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            continue
        if numero == numero:  # descarta NaN
            return numero
    return fallback


# Back-compat D-186: cenas geradas ANTES do rename salvaram as chaves do
# mascote como ``sapoMood``/``sapoPosicao``/``sapoTamanho``. A escrita nova usa
# ``mascotMood``/``mascotPosicao``/``mascotTamanho``; a leitura coalesce o nome
# legado para o novo (sem migrar o banco), de modo que um corte antigo renderiza
# e edita igual a um novo. Este é o ÚNICO ponto do backend que cita o nome legado.
_CHAVES_MASCOTE_LEGADAS = {
    "mascotMood": "sapoMood",
    "mascotPosicao": "sapoPosicao",
    "mascotTamanho": "sapoTamanho",
}


def coalescer_chaves_mascote(cena: dict) -> dict:
    """Traduz as chaves legadas ``sapo*`` para as novas ``mascot*`` numa cena.

    Preserva o valor novo quando já presente; caso contrário adota o legado.
    Remove sempre a chave legada do resultado para o consumidor ver só ``mascot*``.
    """
    resultado = dict(cena)
    for nova, legada in _CHAVES_MASCOTE_LEGADAS.items():
        if resultado.get(nova) is None and legada in resultado:
            resultado[nova] = resultado[legada]
        resultado.pop(legada, None)
    return resultado


def normalizar_cena_remotion(cena: dict) -> dict:
    """Garante ``inicio``/``fim``/``inicio_seg``/``fim_seg`` coerentes na cena.

    I-031: cena ``tela_cheia`` sempre vira ``card`` — aplicado tanto no
    salvamento quanto no GET (via ``_corte_to_dict``), para que cenas antigas
    com ``modelo_cena=padrao`` no banco apareçam como card no editor e no render.

    D-186: também coalesce as chaves legadas do mascote (``sapo*`` → ``mascot*``)
    para que cortes antigos apareçam com as chaves novas no editor e no render.
    """
    cena = coalescer_chaves_mascote(cena)
    inicio = primeiro_numero_valido(cena.get("inicio_seg"), cena.get("inicio"))
    fim = primeiro_numero_valido(cena.get("fim_seg"), cena.get("fim"), fallback=inicio + 5.0)
    if fim <= inicio:
        fim = inicio + 5.0
    normalizada = {**cena, "inicio": inicio, "fim": fim, "inicio_seg": inicio, "fim_seg": fim}
    if normalizada.get("tipo") == "tela_cheia":
        normalizada["modelo_cena"] = "card"
    return normalizada


def normalizar_cenas_remotion_payload(payload: list | dict) -> list | dict:
    """Normaliza cada cena de um payload, seja lista de cenas ou dict com ``cenas``."""
    if isinstance(payload, list):
        return [
            normalizar_cena_remotion(cena) if isinstance(cena, dict) else cena for cena in payload
        ]
    if isinstance(payload, dict) and isinstance(payload.get("cenas"), list):
        return {
            **payload,
            "cenas": [
                normalizar_cena_remotion(cena) if isinstance(cena, dict) else cena
                for cena in payload["cenas"]
            ],
        }
    return payload


# Uma cena pode estourar levemente o fim do corte sem que isso seja defeito: a
# ultima cena ganha duracao fixa (~5-6s) e pode passar do ultimo segmento de
# fala. O que denuncia tempo ABSOLUTO e o INICIO cair fora do corte.
TOLERANCIA_FIM_CENA_SEG = 15.0


def cenas_fora_do_corte(cenas: list, duracao_seg: float) -> list[dict]:
    """Cenas cujo tempo nao cabe na duracao do corte.

    O sintoma classico e a cena gravada com o tempo ABSOLUTO da live (posicao
    na live inteira) convivendo com cenas de tempo relativo — acontece quando
    o roteiro visual e gerado antes do rebase da transcricao e depois mesclado
    com um gerado depois. A timeline do editor faz ``max(duracao, maiorFim)`` e
    ESTICA para acomodar a cena invalida, exibindo um total muito maior que o
    video, que roda vazio depois do fim real.

    Retorna uma lista de ``{"indice", "inicio", "fim"}`` — vazia quando esta
    tudo dentro. Com ``duracao_seg`` nao positiva nao ha como julgar, entao
    devolve vazio (nunca acusa por falta de referencia).
    """
    if duracao_seg <= 0:
        return []
    fora = []
    for indice, cena in enumerate(cenas):
        if not isinstance(cena, dict):
            continue
        normalizada = normalizar_cena_remotion(cena)
        inicio, fim = normalizada["inicio"], normalizada["fim"]
        if inicio >= duracao_seg or fim > duracao_seg + TOLERANCIA_FIM_CENA_SEG:
            fora.append({"indice": indice, "inicio": inicio, "fim": fim})
    return fora


def extrair_cenas_remotion(payload: list | dict) -> list:
    """Extrai a lista de cenas de um payload (lista direta ou dict com ``cenas``)."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("cenas"), list):
        return payload["cenas"]
    return []


def tem_colapso_de_tempos_das_cenas(cenas: list) -> bool:
    """Detecta colapso: a maioria das cenas compartilha o mesmo par (início, fim)."""
    if len(cenas) < _MINIMO_DE_CENAS_PARA_COLAPSO:
        return False
    grupos: dict[tuple[float, float], int] = {}
    for cena in cenas:
        if not isinstance(cena, dict):
            continue
        normalizada = normalizar_cena_remotion(cena)
        chave = (round(normalizada["inicio"], 2), round(normalizada["fim"], 2))
        grupos[chave] = grupos.get(chave, 0) + 1
    maior_grupo = max(grupos.values(), default=0)
    return maior_grupo >= max(3, int(len(cenas) * 0.8 + 0.999))

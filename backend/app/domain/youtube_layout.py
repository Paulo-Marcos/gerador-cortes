"""Contrato puro para layout YouTube Full/Compartilhada.

O layout controla duas coisas independentes:
- recomposicao do video na grade quando ha tela compartilhada;
- layout efetivo dos cards v2 para nao cobrir interlocutor/tela.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any

MODO_FULL = "full"
MODO_COMPARTILHADA = "compartilhada"
MODOS_VALIDOS = {MODO_FULL, MODO_COMPARTILHADA}

# Fundos editoriais selecionaveis para o layout compartilhado (handoff Design).
FUNDOS_VALIDOS = {
    "hud-forte",
    "topo-estrutural",
    "hud-topo",
    "architectural-hud",
    "topographic",
    "cosmograph",
}
FUNDO_PADRAO = "hud-forte"
PLACA_PADRAO = {"nome": "", "papel": ""}

CARD_LAYOUT_FULL = "vertical"
CARD_LAYOUT_COMPARTILHADA = "vertical"

DEFAULT_CROP_FACECAM = {"x": 24, "y": 410, "w": 340, "h": 260}
DEFAULT_CROP_TELA = {"x": 365, "y": 180, "w": 1325, "h": 720}
DEFAULT_SLOT_FACECAM = {"x": 54, "y": 405, "w": 340, "h": 260}
DEFAULT_SLOT_TELA = {"x": 500, "y": 150, "w": 1325, "h": 720}
TELAS_COMPARTILHADAS_PADRAO = 2
TELAS_COMPARTILHADAS_VALIDAS = {1, 2}
LEGACY_SLOT_FACECAM = {"x": 54, "y": 405, "w": 390, "h": 292}
LEGACY_SLOT_TELA = {"x": 500, "y": 150, "w": 1325, "h": 745}
CANVAS_W = 1920
CANVAS_H = 1080

# F-060: posicionamento do modo FULL. Default = quadro inteiro -> tela inteira,
# que reproduz exatamente o comportamento anterior (video sem crop nem palco).
DEFAULT_FULL_CROP = {"x": 0, "y": 0, "w": CANVAS_W, "h": CANVAS_H}
DEFAULT_FULL_SLOT = {"x": 0, "y": 0, "w": CANVAS_W, "h": CANVAS_H}

DEFAULT_LAYOUT_YOUTUBE = {
    "modo_padrao": MODO_FULL,
    "fundo": FUNDO_PADRAO,
    "placa": dict(PLACA_PADRAO),
    "regioes": [],
    "compartilhada": {
        "telas": TELAS_COMPARTILHADAS_PADRAO,
        "crop_facecam": DEFAULT_CROP_FACECAM,
        "crop_tela": DEFAULT_CROP_TELA,
        "slot_facecam": DEFAULT_SLOT_FACECAM,
        "slot_tela": DEFAULT_SLOT_TELA,
    },
    "full": {
        "crop": DEFAULT_FULL_CROP,
        "slot": DEFAULT_FULL_SLOT,
    },
}


def layout_youtube_default() -> dict[str, Any]:
    return deepcopy(DEFAULT_LAYOUT_YOUTUBE)


# Bump quando o visual do palco (chrome.tsx / palco-entry.tsx no video-renderer)
# mudar — invalida o cache de PNG do palco mesmo com layout idêntico.
PALCO_CHROME_VERSION = "1"


def palco_cache_key(layout_youtube: Any, fallback_layout: Any = None) -> str:
    """Chave estável do PNG base do palco — só os campos que afetam o visual.

    Combina versão do chrome + fundo + placa + geometria compartilhada do corte.
    Overrides de segmento (F-048) usam `palco_cache_key_para_config()` em cima
    do mesmo backbone, garantindo PNGs distintos por config único.
    """
    layout = normalizar_layout_youtube(layout_youtube, fallback_layout)
    return palco_cache_key_para_config(
        layout["compartilhada"],
        fundo=layout["fundo"],
        placa=layout["placa"],
    )


def palco_cache_key_para_config(
    compartilhada: dict[str, Any],
    fundo: str,
    placa: dict[str, str],
) -> str:
    """Variante de `palco_cache_key` que recebe um config compartilhada arbitrario.

    Util para gerar a chave de PNG de um segmento com override (F-048): o caller
    passa o compartilhada ja resolvido (corte + override mesclados) e mantem o
    mesmo fundo/placa do corte.
    """
    relevante = {
        "v": PALCO_CHROME_VERSION,
        "fundo": fundo,
        "placa": placa,
        "compartilhada": {
            "telas": compartilhada["telas"],
            **{
                chave: compartilhada[chave]
                for chave in ("crop_facecam", "crop_tela", "slot_facecam", "slot_tela")
            },
        },
    }
    blob = json.dumps(relevante, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:16]


def resolver_layout_em_cascata(
    corte_layout: Any = None,
    projeto_padrao: Any = None,
    global_padrao: Any = None,
) -> dict[str, Any]:
    """F-048: resolve layout aplicando cascade lazy global -> projeto -> corte.

    Cada nivel pode estar ausente, vazio ou parcial. Resultado final tem todos
    os campos populados via fallback chain ate DEFAULT_LAYOUT_YOUTUBE. Util para
    rendering (preview/PNG/FFmpeg) e para resolucao do config efetivo de um
    segmento, que sempre cai nessa cadeia mais o eventual override da regiao.
    """
    global_norm = normalizar_layout_youtube(global_padrao)
    projeto_norm = normalizar_layout_youtube(projeto_padrao, fallback_layout=global_norm)
    return normalizar_layout_youtube(corte_layout, fallback_layout=projeto_norm)


def normalizar_layout_youtube(payload: Any, fallback_layout: Any = None) -> dict[str, Any]:
    """Normaliza payload vindo do frontend/API sem depender de banco ou FastAPI."""
    layout = layout_youtube_default()

    if isinstance(fallback_layout, str) and fallback_layout.strip():
        try:
            fallback_layout = json.loads(fallback_layout)
        except Exception:
            fallback_layout = None

    # I-025: parse simetrico — em resolver_layout_em_cascata, global_padrao e
    # projeto_padrao chegam como string (Text no banco) e cairiam direto no
    # `not isinstance(payload, dict)` abaixo, descartando o cascade.
    if isinstance(payload, str) and payload.strip():
        try:
            payload = json.loads(payload)
        except Exception:
            payload = None

    fallback_modo: str | None = None
    if isinstance(fallback_layout, dict):
        fallback_modo = _normalizar_modo(fallback_layout.get("modo_padrao"))
        if "fundo" in fallback_layout:
            layout["fundo"] = fallback_layout["fundo"]
        if "placa" in fallback_layout:
            layout["placa"] = fallback_layout["placa"]
        if "compartilhada" in fallback_layout and isinstance(
            fallback_layout["compartilhada"], dict
        ):
            layout["compartilhada"].update(fallback_layout["compartilhada"])
        if "full" in fallback_layout and isinstance(fallback_layout["full"], dict):
            layout["full"].update(fallback_layout["full"])

    if not isinstance(payload, dict):
        # Sem corte (payload ausente): herda o modo do padrao do projeto, se houver.
        if fallback_modo:
            layout["modo_padrao"] = fallback_modo
        return layout

    modo_payload = _normalizar_modo(payload.get("modo_padrao"))
    # Um corte "intocado" carrega so a sentinela {"modo_padrao":"full","regioes":[]}.
    # Nesse caso ele deve JA INICIALIZAR com o modo do padrao do projeto (F-020);
    # assim que o usuario configura algo (fundo/placa/posicoes/regioes ou escolhe
    # compartilhada explicitamente), passa a valer o modo do proprio corte.
    corte_configurado = (
        "fundo" in payload
        or "placa" in payload
        or "compartilhada" in payload
        or "full" in payload
        or bool(payload.get("regioes"))
        or modo_payload == MODO_COMPARTILHADA
    )
    if corte_configurado:
        if modo_payload:
            layout["modo_padrao"] = modo_payload
    elif fallback_modo:
        layout["modo_padrao"] = fallback_modo
    elif modo_payload:
        layout["modo_padrao"] = modo_payload

    if "fundo" in payload:
        layout["fundo"] = _normalizar_fundo(payload.get("fundo"), layout["fundo"])
    if "placa" in payload:
        layout["placa"] = _normalizar_placa(payload.get("placa"), layout["placa"])

    compartilhada = payload.get("compartilhada")
    if isinstance(compartilhada, dict):
        config = layout["compartilhada"]
        config["telas"] = _normalizar_quantidade_telas(
            compartilhada.get("telas"),
            config.get("telas", TELAS_COMPARTILHADAS_PADRAO),
        )
        for chave in ("crop_facecam", "crop_tela", "slot_facecam", "slot_tela"):
            config[chave] = _normalizar_retangulo(
                compartilhada.get(chave),
                config[chave],
            )
    config = layout["compartilhada"]
    config["telas"] = _normalizar_quantidade_telas(config.get("telas"))
    config["slot_facecam"] = _normalizar_slot_proporcional(
        config["slot_facecam"],
        config["crop_facecam"],
        DEFAULT_SLOT_FACECAM,
        LEGACY_SLOT_FACECAM,
    )
    config["slot_tela"] = _normalizar_slot_proporcional(
        config["slot_tela"],
        config["crop_tela"],
        DEFAULT_SLOT_TELA,
        LEGACY_SLOT_TELA,
    )

    # F-060: posicionamento do modo FULL (crop do bruto + encaixe no canvas).
    layout["full"] = _normalizar_full_config(payload.get("full"), layout["full"])

    # I-029 v2 / F-060: padroes de SEGMENTO sao por-corte (nao cascateiam) e
    # opcionais — so entram no resultado quando presentes no payload. Sem isso
    # o save em routers/cortes.py (que normaliza antes de gravar) os descartava.
    segmento_compartilhada = payload.get("compartilhada_segmento")
    if isinstance(segmento_compartilhada, dict) and segmento_compartilhada:
        seg = merge_compartilhada(layout["compartilhada"], None)
        seg["telas"] = _normalizar_quantidade_telas(
            segmento_compartilhada.get("telas"), seg["telas"]
        )
        for chave in ("crop_facecam", "crop_tela", "slot_facecam", "slot_tela"):
            seg[chave] = _normalizar_retangulo(segmento_compartilhada.get(chave), seg[chave])
        layout["compartilhada_segmento"] = seg
    segmento_full = payload.get("full_segmento")
    if isinstance(segmento_full, dict) and segmento_full:
        layout["full_segmento"] = _normalizar_full_config(segmento_full, layout["full"])

    regioes = []
    for regiao in payload.get("regioes") or []:
        normalizada = _normalizar_regiao(regiao)
        if normalizada is not None:
            regioes.append(normalizada)

    layout["regioes"] = sorted(regioes, key=lambda item: (item["inicio"], item["fim"]))
    return layout


def aplicar_layout_card_por_contexto(
    cenas: list[dict[str, Any]],
    layout_youtube: Any,
    layout_card_padrao: str = CARD_LAYOUT_FULL,
    fallback_layout: Any = None,
    global_padrao: Any = None,
) -> list[dict[str, Any]]:
    """Aplica layout horizontal/vertical em cenas com layout_card auto/ausente.

    F-048: aceita `global_padrao` como terceiro nivel da cascade.
    """
    layout = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=fallback_layout,
        global_padrao=global_padrao,
    )
    layout_padrao = (
        layout_card_padrao if layout_card_padrao in {"horizontal", "vertical"} else CARD_LAYOUT_FULL
    )
    shared_card_zone = _zona_card_vertical_compartilhada(layout["compartilhada"])
    cenas_render = []
    for cena in cenas:
        if not isinstance(cena, dict):
            cenas_render.append(cena)
            continue

        render = dict(cena)
        layout_card = render.get("layout_card")
        if layout_card not in {"horizontal", "vertical"}:
            modo = resolver_modo_intervalo(
                layout_youtube,
                _numero(render.get("inicio"), 0.0),
                _numero(render.get("fim"), _numero(render.get("inicio"), 0.0) + 5.0),
                fallback_layout=fallback_layout,
                global_padrao=global_padrao,
            )
            render["layout_card"] = layout_padrao
        else:
            modo = resolver_modo_intervalo(
                layout_youtube,
                _numero(render.get("inicio"), 0.0),
                _numero(render.get("fim"), _numero(render.get("inicio"), 0.0) + 5.0),
                fallback_layout=fallback_layout,
                global_padrao=global_padrao,
            )

        if modo == MODO_COMPARTILHADA:
            render["layout_youtube_modo"] = MODO_COMPARTILHADA
            render["layout_card_zone"] = dict(shared_card_zone)

        if render.get("sombra_nivel") in (None, ""):
            render["sombra_nivel"] = "auto"

        # I-031: tela_cheia sempre renderiza como card. Outras cenas usam
        # card como default; "padrao" so vale se explicitado (raro).
        if render.get("tipo") == "tela_cheia":
            render["modelo_cena"] = "card"
        elif render.get("modelo_cena") in (None, "", "auto"):
            render["modelo_cena"] = "card"

        cenas_render.append(render)
    return cenas_render


def _zona_card_vertical_compartilhada(config: dict[str, Any]) -> dict[str, int]:
    """Retangulo livre a esquerda para card vertical no layout compartilhado.

    I-035: a faixa e calculada de forma DINAMICA por layout YT. A borda externa
    do palco (StageChrome) e fixa, entao define o topo e a esquerda. As duas
    telas mudam por preset ou por customizacao do corte, e sao elas que limitam
    o espaco interno:
      - a tela grande (``slot_tela``) limita o alcance a DIREITA;
      - a tela pequena / facecam (``slot_facecam``) limita o alcance INFERIOR.
    Assim, sempre que as telas deixam mais respiro a esquerda, o card cresce.
    """
    margem = 48
    respiro = 28

    if config.get("telas") == 1:
        tela = _tamanho_renderizado(config["crop_tela"], config["slot_tela"])
        tela_right = config["slot_tela"]["x"] + tela["w"]
        left_space = config["slot_tela"]["x"] - margem - respiro
        right_space = CANVAS_W - tela_right - margem - respiro
        use_right_side = right_space > left_space
        if use_right_side:
            left = min(CANVAS_W - margem - 240, tela_right + respiro)
            right = CANVAS_W - margem
        else:
            left = margem
            right = max(left + 240, config["slot_tela"]["x"] - respiro)
        top = max(56, min(config["slot_tela"]["y"], CANVAS_H - 236))
        bottom = max(top + 180, min(CANVAS_H - 56, config["slot_tela"]["y"] + tela["h"]))

        return {
            "x": int(left),
            "y": int(top),
            "w": int(max(240, right - left)),
            "h": int(max(180, bottom - top)),
        }

    # 2 telas: borda externa fixa em cima/esquerda; as telas limitam a faixa.
    # O topo usa respiro maior que a lateral para o card nao colar no contorno
    # do palco (StageChrome).
    margem_topo = 96
    left = margem
    top = margem_topo
    right = config["slot_tela"]["x"] - respiro
    bottom = config["slot_facecam"]["y"] - respiro

    # Pisos de seguranca: mesmo que um preset aproxime demais as telas da borda,
    # o card nunca some. 240x180 espelha o piso do fit (shared-card-zone.tsx).
    right = min(max(right, left + 240), CANVAS_W - margem)
    bottom = min(max(bottom, top + 180), CANVAS_H - margem)

    return {
        "x": int(left),
        "y": int(top),
        "w": int(right - left),
        "h": int(bottom - top),
    }


def _tamanho_renderizado(crop: dict[str, int], slot: dict[str, int]) -> dict[str, int]:
    escala = max(0.01, min(slot["w"] / crop["w"], slot["h"] / crop["h"]))
    return {"w": round(crop["w"] * escala), "h": round(crop["h"] * escala)}


def resolver_modo_intervalo(
    layout_youtube: Any,
    inicio: float,
    fim: float,
    fallback_layout: Any = None,
    global_padrao: Any = None,
) -> str:
    layout = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=fallback_layout,
        global_padrao=global_padrao,
    )
    meio = max(0.0, (inicio + max(fim, inicio)) / 2)
    return resolver_modo_no_tempo(layout, meio)


def resolver_modo_no_tempo(
    layout_youtube: Any,
    tempo: float,
    fallback_layout: Any = None,
    global_padrao: Any = None,
) -> str:
    layout = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=fallback_layout,
        global_padrao=global_padrao,
    )
    modo = layout["modo_padrao"]
    for regiao in layout["regioes"]:
        if regiao["inicio"] <= tempo < regiao["fim"]:
            modo = regiao["modo"]
    return modo


def regioes_compartilhadas(
    layout_youtube: Any,
    duracao_seg: float | None = None,
    fallback_layout: Any = None,
    global_padrao: Any = None,
) -> list[dict[str, Any]]:
    """Retorna intervalos em que o video deve usar layout compartilhado.

    F-048: cada intervalo carrega o config efetivo (corte default + override
    do segmento quando presente), pronto para ser consumido pelo renderer.
    Sweep em duas etapas:
      1. Determinar quais trechos sao shared (logica original, ignorando override).
      2. Em cada trecho shared, "fatiar" por regioes com override e atribuir o
         override ativo (o ULTIMO que cobre a fatia, alinhado com o sweep de modo).

    Cascade lazy: quando `global_padrao` ou `fallback_layout` (projeto) sao dados,
    o base_config herda deles caso o corte nao tenha `compartilhada` proprio.
    """
    layout = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=fallback_layout,
        global_padrao=global_padrao,
    )
    duracao = _numero(duracao_seg, 0.0)
    base_config = layout["compartilhada"]

    # Etapa 1: intervalos compartilhados ignorando override (semantica antiga).
    if layout["modo_padrao"] == MODO_COMPARTILHADA and duracao > 0:
        base_shared: list[tuple[float, float]] = [(0.0, duracao)]
    else:
        base_shared = [
            (regiao["inicio"], regiao["fim"])
            for regiao in layout["regioes"]
            if regiao["modo"] == MODO_COMPARTILHADA
        ]

    for regiao in layout["regioes"]:
        if regiao["modo"] == MODO_FULL:
            base_shared = _subtrair_intervalo(base_shared, regiao["inicio"], regiao["fim"])

    override_regions = [
        regiao
        for regiao in layout["regioes"]
        if regiao["modo"] == MODO_COMPARTILHADA and regiao.get("compartilhada")
    ]

    # Etapa 2: para cada trecho shared, fatiar pelos overrides que o cobrem.
    fatias: list[tuple[float, float, dict[str, Any] | None]] = []
    for inicio_shared, fim_shared in base_shared:
        cortes = {inicio_shared, fim_shared}
        for override_regiao in override_regions:
            if override_regiao["fim"] <= inicio_shared or override_regiao["inicio"] >= fim_shared:
                continue
            cortes.add(max(inicio_shared, override_regiao["inicio"]))
            cortes.add(min(fim_shared, override_regiao["fim"]))
        cortes_ordenados = sorted(cortes)
        for indice in range(len(cortes_ordenados) - 1):
            inicio_fatia = cortes_ordenados[indice]
            fim_fatia = cortes_ordenados[indice + 1]
            if fim_fatia <= inicio_fatia:
                continue
            override_ativo: dict[str, Any] | None = None
            for override_regiao in override_regions:
                if (
                    override_regiao["inicio"] <= inicio_fatia
                    and override_regiao["fim"] >= fim_fatia
                ):
                    override_ativo = override_regiao.get("compartilhada")
            fatias.append((inicio_fatia, fim_fatia, override_ativo))

    fatias = _recortar_e_mesclar_com_override(fatias, duracao if duracao > 0 else None)

    resultado: list[dict[str, Any]] = []
    for inicio, fim, override in fatias:
        config = merge_compartilhada(base_config, override)
        resultado.append(
            {
                "inicio": inicio,
                "fim": fim,
                **config,
            }
        )
    return resultado


def _normalizar_regiao(regiao: Any) -> dict[str, Any] | None:
    if not isinstance(regiao, dict):
        return None

    inicio = max(0.0, _numero(regiao.get("inicio"), 0.0))
    fim = max(inicio, _numero(regiao.get("fim"), inicio))
    if fim <= inicio:
        return None

    modo = _normalizar_modo(regiao.get("modo")) or MODO_COMPARTILHADA
    resultado: dict[str, Any] = {
        "inicio": round(inicio, 3),
        "fim": round(fim, 3),
        "modo": modo,
    }

    # F-048: override opcional de compartilhada por segmento. Aceita parcial —
    # campos ausentes herdam do compartilhada do corte (resolvido em
    # regioes_compartilhadas).
    override = regiao.get("compartilhada")
    if isinstance(override, dict) and override:
        normalizado: dict[str, Any] = {}
        if "telas" in override:
            normalizado["telas"] = _normalizar_quantidade_telas(override.get("telas"))
        for chave, padrao in (
            ("crop_facecam", DEFAULT_CROP_FACECAM),
            ("crop_tela", DEFAULT_CROP_TELA),
            ("slot_facecam", DEFAULT_SLOT_FACECAM),
            ("slot_tela", DEFAULT_SLOT_TELA),
        ):
            if chave in override:
                normalizado[chave] = _normalizar_retangulo(override.get(chave), padrao)
        if normalizado:
            resultado["compartilhada"] = normalizado

    # F-060: override opcional do posicionamento FULL por segmento (parcial).
    override_full = regiao.get("full")
    if isinstance(override_full, dict) and override_full:
        normalizado_full: dict[str, Any] = {}
        if "crop" in override_full:
            normalizado_full["crop"] = _normalizar_retangulo(
                override_full.get("crop"), DEFAULT_FULL_CROP
            )
        if "slot" in override_full:
            normalizado_full["slot"] = _normalizar_retangulo(
                override_full.get("slot"), DEFAULT_FULL_SLOT
            )
        if normalizado_full:
            resultado["full"] = normalizado_full

    return resultado


def merge_full(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    """Combina o config FULL do corte com o override de um segmento (F-060)."""
    resultado = {
        "crop": dict(base["crop"]),
        "slot": dict(base["slot"]),
    }
    if not override:
        return resultado
    for chave in ("crop", "slot"):
        if chave in override:
            resultado[chave] = dict(override[chave])
    return resultado


def full_config_e_default(config: dict[str, Any]) -> bool:
    """True quando o FULL e quadro inteiro -> tela inteira (sem crop nem palco)."""
    return config.get("crop") == DEFAULT_FULL_CROP and config.get("slot") == DEFAULT_FULL_SLOT


def config_compartilhada_para_full(full_config: dict[str, Any]) -> dict[str, Any]:
    """F-060: traduz um config FULL para o config de palco de 1 tela.

    O FULL posicionado renderiza pelo MESMO pipeline do palco compartilhado de
    tela unica (fundo + chrome + placa via PNG, crop/scale/overlay no FFmpeg):
    crop/slot do FULL viram crop_tela/slot_tela. Facecam fica nos defaults — com
    telas=1 ela nao e desenhada nem afeta a chave de cache de forma ambigua.
    """
    return {
        "telas": 1,
        "crop_facecam": dict(DEFAULT_CROP_FACECAM),
        "crop_tela": dict(full_config["crop"]),
        "slot_facecam": dict(DEFAULT_SLOT_FACECAM),
        "slot_tela": dict(full_config["slot"]),
    }


def regioes_full_posicionadas(
    layout_youtube: Any,
    duracao_seg: float | None = None,
    fallback_layout: Any = None,
    global_padrao: Any = None,
) -> list[dict[str, Any]]:
    """Intervalos FULL cujo posicionamento efetivo difere do default (F-060).

    Complemento exato de `regioes_compartilhadas` dentro de [0, duracao]:
    o que nao e compartilhado e FULL. Cada intervalo retorna com o config
    efetivo (base do corte + override `full` do segmento). Trechos FULL com
    config default sao OMITIDOS — eles seguem o caminho de video puro.
    """
    duracao = _numero(duracao_seg, 0.0)
    if duracao <= 0:
        return []

    layout = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=fallback_layout,
        global_padrao=global_padrao,
    )
    base_config = layout["full"]

    full_intervalos: list[tuple[float, float]] = [(0.0, duracao)]
    for regiao in regioes_compartilhadas(
        layout_youtube,
        duracao_seg=duracao,
        fallback_layout=fallback_layout,
        global_padrao=global_padrao,
    ):
        full_intervalos = _subtrair_intervalo(full_intervalos, regiao["inicio"], regiao["fim"])

    override_regions = [
        regiao for regiao in layout["regioes"] if regiao["modo"] == MODO_FULL and regiao.get("full")
    ]

    fatias: list[tuple[float, float, dict[str, Any] | None]] = []
    for inicio_full, fim_full in full_intervalos:
        cortes = {inicio_full, fim_full}
        for override_regiao in override_regions:
            if override_regiao["fim"] <= inicio_full or override_regiao["inicio"] >= fim_full:
                continue
            cortes.add(max(inicio_full, override_regiao["inicio"]))
            cortes.add(min(fim_full, override_regiao["fim"]))
        cortes_ordenados = sorted(cortes)
        for indice in range(len(cortes_ordenados) - 1):
            inicio_fatia = cortes_ordenados[indice]
            fim_fatia = cortes_ordenados[indice + 1]
            if fim_fatia <= inicio_fatia:
                continue
            override_ativo: dict[str, Any] | None = None
            for override_regiao in override_regions:
                if (
                    override_regiao["inicio"] <= inicio_fatia
                    and override_regiao["fim"] >= fim_fatia
                ):
                    override_ativo = override_regiao.get("full")
            fatias.append((inicio_fatia, fim_fatia, override_ativo))

    fatias = _recortar_e_mesclar_com_override(fatias, duracao)

    resultado: list[dict[str, Any]] = []
    for inicio, fim, override in fatias:
        config = merge_full(base_config, override)
        if full_config_e_default(config):
            continue
        resultado.append({"inicio": inicio, "fim": fim, **config})
    return resultado


def merge_compartilhada(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    """Combina o config compartilhada do corte com o override de um segmento (F-048).

    Override parcial: campos ausentes herdam de `base`. Sempre retorna dict novo
    (cópia rasa de cada subitem), seguro para mutação posterior.
    """
    resultado = {
        "telas": base["telas"],
        "crop_facecam": dict(base["crop_facecam"]),
        "crop_tela": dict(base["crop_tela"]),
        "slot_facecam": dict(base["slot_facecam"]),
        "slot_tela": dict(base["slot_tela"]),
    }
    if not override:
        return resultado
    if "telas" in override:
        resultado["telas"] = override["telas"]
    for chave in ("crop_facecam", "crop_tela", "slot_facecam", "slot_tela"):
        if chave in override:
            resultado[chave] = dict(override[chave])
    return resultado


def _normalizar_fundo(fundo: Any, default: str = FUNDO_PADRAO) -> str:
    if isinstance(fundo, str) and fundo in FUNDOS_VALIDOS:
        return fundo
    return default


def _normalizar_placa(valor: Any, default: dict[str, str] | None = None) -> dict[str, str]:
    base = dict(default) if default else dict(PLACA_PADRAO)
    if not isinstance(valor, dict):
        return base
    nome = valor.get("nome")
    papel = valor.get("papel")
    return {
        "nome": (nome if isinstance(nome, str) else base["nome"])[:80],
        "papel": (papel if isinstance(papel, str) else base["papel"])[:80],
    }


def _normalizar_modo(valor: Any) -> str | None:
    modo = str(valor or "").strip().lower()
    aliases = {
        "padrao": MODO_FULL,
        "default": MODO_FULL,
        "full": MODO_FULL,
        "tela_cheia": MODO_FULL,
        "compartilhada": MODO_COMPARTILHADA,
        "shared": MODO_COMPARTILHADA,
        "screen_share": MODO_COMPARTILHADA,
    }
    normalizado = aliases.get(modo, modo)
    return normalizado if normalizado in MODOS_VALIDOS else None


def _normalizar_quantidade_telas(valor: Any, default: int = TELAS_COMPARTILHADAS_PADRAO) -> int:
    try:
        quantidade = int(valor)
    except (TypeError, ValueError):
        quantidade = default
    return quantidade if quantidade in TELAS_COMPARTILHADAS_VALIDAS else default


def _normalizar_retangulo(valor: Any, fallback: dict[str, int]) -> dict[str, int]:
    if not isinstance(valor, dict):
        return dict(fallback)
    w = _clamp_int(_numero(valor.get("w"), fallback["w"]), 1, CANVAS_W)
    h = _clamp_int(_numero(valor.get("h"), fallback["h"]), 1, CANVAS_H)
    return {
        "x": _clamp_int(_numero(valor.get("x"), fallback["x"]), 0, CANVAS_W - w),
        "y": _clamp_int(_numero(valor.get("y"), fallback["y"]), 0, CANVAS_H - h),
        "w": w,
        "h": h,
    }


def _normalizar_full_config(valor: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    """Normaliza o config FULL: crop livre + slot proporcional ao crop (F-060)."""
    base_crop = fallback.get("crop", DEFAULT_FULL_CROP)
    base_slot = fallback.get("slot", DEFAULT_FULL_SLOT)
    if not isinstance(valor, dict):
        return {"crop": dict(base_crop), "slot": dict(base_slot)}
    crop = _normalizar_retangulo(valor.get("crop"), base_crop)
    slot = _normalizar_slot_proporcional(
        _normalizar_retangulo(valor.get("slot"), base_slot),
        crop,
        DEFAULT_FULL_SLOT,
        legacy=None,
    )
    return {"crop": crop, "slot": slot}


def _normalizar_slot_proporcional(
    slot: dict[str, int],
    crop: dict[str, int],
    fallback: dict[str, int],
    legacy: dict[str, int] | None = None,
) -> dict[str, int]:
    if legacy is not None and slot == legacy:
        return dict(fallback)

    escala = max(0.01, min(slot["w"] / crop["w"], slot["h"] / crop["h"]))
    return _normalizar_retangulo(
        {
            **slot,
            "w": round(crop["w"] * escala),
            "h": round(crop["h"] * escala),
        },
        fallback,
    )


def _clamp_int(valor: float, minimo: int, maximo: int) -> int:
    return max(minimo, min(maximo, int(valor)))


def _numero(valor: Any, fallback: float) -> float:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return fallback
    return numero if numero == numero else fallback


def _subtrair_intervalo(
    intervalos: list[tuple[float, float]],
    inicio_corte: float,
    fim_corte: float,
) -> list[tuple[float, float]]:
    resultado = []
    for inicio, fim in intervalos:
        if fim_corte <= inicio or inicio_corte >= fim:
            resultado.append((inicio, fim))
            continue
        if inicio < inicio_corte:
            resultado.append((inicio, max(inicio, inicio_corte)))
        if fim_corte < fim:
            resultado.append((min(fim, fim_corte), fim))
    return resultado


def _subtrair_intervalo_com_override(
    intervalos: list[tuple[float, float, dict[str, Any] | None]],
    inicio_corte: float,
    fim_corte: float,
) -> list[tuple[float, float, dict[str, Any] | None]]:
    """Mesma logica de _subtrair_intervalo preservando o override de cada par."""
    resultado: list[tuple[float, float, dict[str, Any] | None]] = []
    for inicio, fim, override in intervalos:
        if fim_corte <= inicio or inicio_corte >= fim:
            resultado.append((inicio, fim, override))
            continue
        if inicio < inicio_corte:
            resultado.append((inicio, max(inicio, inicio_corte), override))
        if fim_corte < fim:
            resultado.append((min(fim, fim_corte), fim, override))
    return resultado


def _recortar_e_mesclar_com_override(
    intervalos: list[tuple[float, float, dict[str, Any] | None]],
    duracao: float | None,
) -> list[tuple[float, float, dict[str, Any] | None]]:
    """Recorta para [0, duracao] e mescla intervalos contiguos com mesmo override."""
    validos: list[tuple[float, float, dict[str, Any] | None]] = []
    for inicio, fim, override in intervalos:
        inicio = max(0.0, inicio)
        fim = max(inicio, fim)
        if duracao is not None:
            inicio = min(inicio, duracao)
            fim = min(fim, duracao)
        if fim > inicio:
            validos.append((round(inicio, 3), round(fim, 3), override))

    validos.sort(key=lambda item: (item[0], item[1]))
    mesclados: list[tuple[float, float, dict[str, Any] | None]] = []
    for inicio, fim, override in validos:
        if mesclados and inicio <= mesclados[-1][1] and mesclados[-1][2] == override:
            ant_inicio, ant_fim, ant_override = mesclados[-1]
            mesclados[-1] = (ant_inicio, max(ant_fim, fim), ant_override)
        else:
            mesclados.append((inicio, fim, override))
    return mesclados


def _recortar_e_mesclar(
    intervalos: list[tuple[float, float]],
    duracao: float | None,
) -> list[tuple[float, float]]:
    validos = []
    for inicio, fim in intervalos:
        inicio = max(0.0, inicio)
        fim = max(inicio, fim)
        if duracao is not None:
            inicio = min(inicio, duracao)
            fim = min(fim, duracao)
        if fim > inicio:
            validos.append((round(inicio, 3), round(fim, 3)))

    validos.sort()
    mesclados: list[tuple[float, float]] = []
    for inicio, fim in validos:
        if not mesclados or inicio > mesclados[-1][1]:
            mesclados.append((inicio, fim))
        else:
            anterior_inicio, anterior_fim = mesclados[-1]
            mesclados[-1] = (anterior_inicio, max(anterior_fim, fim))
    return mesclados

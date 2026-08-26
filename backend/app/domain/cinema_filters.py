"""
Predefinicoes de filtros cinematograficos FFmpeg.

O dicionario abaixo e a fonte unica dos filtros expostos para preview/render.
`get_filtro_vf("nenhum")` continua retornando None por compatibilidade.
"""

LETTERBOX_235 = [
    "drawbox=y=0:color=black:height=ih*0.08:t=fill",
    "drawbox=y=ih-ih*0.08+5:color=black:height=ih*0.08+10:t=fill",
]


def com_letterbox(*filtros: str) -> list[str]:
    return [*filtros, *LETTERBOX_235]


def get_filtro_vf(filtro: str) -> str | None:
    """Retorna a string -vf do FFmpeg para o filtro dado, ou None se nao houver.

    Exemplo:
        >>> get_filtro_vf("cinematic_iii")
        "curves=r=...,colorbalance=...,eq=...,vignette=...,drawbox=...,drawbox=..."
    """
    vf_data = FILTROS_CINEMA.get(filtro, {}).get("vf")

    if not vf_data:
        return None

    if isinstance(vf_data, (list, tuple)):
        return ",".join([f for f in vf_data if f])

    return vf_data


# Componentes reutilizaveis dos presets — declarados uma vez para evitar
# divergencia entre variantes (todas usam exatamente a mesma string ffmpeg).
_CIII_CURVES = (
    "curves=r='0/0.05 0.5/0.55 1/0.95':g='0/0.03 0.5/0.5 1/0.92':b='0/0.05 0.5/0.48 1/0.9'"
)
_CIII_COLORBALANCE = "colorbalance=rs=-0.1:gs=0.0:bs=0.1:rh=0.0:gh=0.0:bh=-0.05"
_CIII_EQ = "eq=contrast=1.12:saturation=0.85:brightness=-0.02"
_CIII_VIGNETTE = "vignette=PI/5"

_BYPASS_COLORTEMP = "colortemperature=temperature=4750:mix=0.15"
_BYPASS_EQ = "eq=contrast=1.16:saturation=0.90:brightness=0.01:gamma=0.98"
_BYPASS_COLORBALANCE = "colorbalance=rs=0.01:bs=-0.02:rm=0.04:bm=-0.03:rh=0.05:gh=0.02:bh=-0.06"
_BYPASS_UNSHARP = "unsharp=5:5:0.45:5:5:0.0"


# Custos revalidados em 26/08/2026 sobre 60s de video, com o comando REAL de
# producao (layout de palco pre-composto + h264_qsv). Os numeros anteriores
# vinham do F-030, medidos em clip60.mkv SEM layout shared — pipeline mais
# simples, proporcoes diferentes; por isso foram reescritos aqui.
# Achado da revalidacao: o componente caro do Cine III e o COLORBALANCE
# (+122% sobre o leve), nao a vinheta (+23%).
FILTROS_CINEMA: dict[str, dict] = {
    # ─── Cinematico III — referencia + variantes ─────────────────────────────
    "cinematic_iii": {
        "nome": "Cinematico III (completo)",
        "vf": com_letterbox(_CIII_CURVES, _CIII_COLORBALANCE, _CIII_EQ, _CIII_VIGNETTE),
        "descricao": "Referencia completa. O mais caro: 173s para 60s de video (2.2x o leve).",
    },
    "cinematic_iii_sem_vignette": {
        "nome": "Cinematico III SEM vinheta",
        "vf": com_letterbox(_CIII_CURVES, _CIII_COLORBALANCE, _CIII_EQ),
        "descricao": "Sem escurecimento de borda, mas mantem o colorbalance — que "
        "e o componente caro. Custa o mesmo que o completo (173s/60s).",
    },
    "cinematic_iii_sem_colorbalance": {
        "nome": "Cinematico III com vinheta",
        "vf": com_letterbox(_CIII_CURVES, _CIII_EQ, _CIII_VIGNETTE),
        "descricao": "Assinatura visual do Cine III (vinheta) sem o deslocamento "
        "de cor para o frio. Custa +23% sobre o leve (96s/60s) contra +122% do "
        "completo.",
    },
    "cinematic_iii_leve": {
        "nome": "Cinematico III leve (curves + eq)",
        "vf": com_letterbox(_CIII_CURVES, _CIII_EQ),
        "descricao": "Sem vinheta e sem colorbalance. O mais rapido dos quatro (78s/60s).",
    },
    # ─── Bypass Dourado ──────────────────────────────────────────────────────
    "bypass_dourado_aberto": {
        "nome": "Bypass Dourado (completo)",
        "vf": com_letterbox(_BYPASS_COLORTEMP, _BYPASS_EQ, _BYPASS_COLORBALANCE, _BYPASS_UNSHARP),
        "descricao": "Padrao quente. Grade ~0.87x (60s video -> 69s render).",
    },
}

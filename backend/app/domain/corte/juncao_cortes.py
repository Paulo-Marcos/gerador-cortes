"""D-575: matemática pura da junção de dois cortes adjacentes.

Dois relógios convivem dentro de um corte, e juntar dois deles exige respeitar
os dois separadamente:

* **Tempo da live** (absoluto) — `inicio_seg`/`fim_seg` do corte e de cada
  desvio. Aqui juntar é concatenar: nenhum número muda de significado, porque
  ambos os cortes medem a partir do começo da mesma live.
* **Tempo do bruto** (relativo, nasce no zero) — cenas Remotion, regiões do
  layout YouTube, segmentos detectados e os shorts. Tudo que pertencia ao
  SEGUNDO corte precisa andar para a frente pela duração LÍQUIDA do primeiro,
  porque no bruto mesclado o material dele só começa depois que o primeiro
  termina.

Confundir os dois é o erro clássico (ver `corte_mapper.cenas_fora_do_corte`):
cena com tempo absoluto convivendo com cena relativa estica a timeline do
editor e deixa o vídeo rodando vazio depois do fim real.

Módulo puro: só dicts, listas e números — sem SQLAlchemy, sem HTTP.
"""

from app.domain.compartilhado.time_convert import seg_to_hms
from app.domain.corte.segment_calculator import calcular_segmentos, normalizar_desvio

# Campos de tempo (em segundos do bruto) de cada tipo de marcação deslocável.
CAMPOS_TEMPO_CENA = ("inicio", "fim", "inicio_seg", "fim_seg")
CAMPOS_TEMPO_REGIAO = ("inicio", "fim")
CAMPOS_TEMPO_SEGMENTO = ("inicio", "fim")

MOTIVO_VAO = "Vão entre cortes juntados"
ORIGEM_VAO = "juncao"


def duracao_liquida(inicio_seg: float, fim_seg: float, desvios: list[dict]) -> float:
    """Duração do bruto que este span produz, já sem os trechos removidos.

    É exatamente o que o pipeline vai gerar: reusa `calcular_segmentos`, com o
    mesmo descarte de micro-fatias, em vez de subtrair durações de desvios na
    mão (que erra quando dois desvios se sobrepõem).

    Exemplo:
        >>> duracao_liquida(0.0, 100.0, [{"inicio_seg": 30.0, "fim_seg": 40.0}])
        90.0
    """
    if fim_seg <= inicio_seg:
        return 0.0
    segmentos = calcular_segmentos(inicio_seg, fim_seg, desvios)
    return round(sum(float(s["end"]) - float(s["start"]) for s in segmentos), 3)


def desvio_do_vao(fim_primeiro: float, inicio_segundo: float) -> dict | None:
    """O intervalo entre os dois cortes, convertido em trecho a remover.

    Sem isto a junção arrastaria para dentro do corte material que o operador
    nunca aprovou — o vão entre 12:00 e 15:00 viraria conteúdo. Marcando-o
    como desvio, o bruto mesclado é a emenda exata do que os dois cortes já
    eram. Devolve `None` quando os cortes se tocam ou se sobrepõem.
    """
    if inicio_segundo <= fim_primeiro:
        return None
    return normalizar_desvio(
        {
            "inicio_seg": round(float(fim_primeiro), 3),
            "fim_seg": round(float(inicio_segundo), 3),
            "inicio_hms": seg_to_hms(fim_primeiro),
            "fim_hms": seg_to_hms(inicio_segundo),
            "motivo": MOTIVO_VAO,
            "origem": ORIGEM_VAO,
        }
    )


def juntar_desvios(
    desvios_primeiro: list[dict],
    desvios_segundo: list[dict],
    *,
    fim_primeiro: float,
    inicio_segundo: float,
) -> list[dict]:
    """Une os trechos a remover dos dois cortes, acrescentando o vão entre eles.

    Não mescla sobreposições de propósito: `calcular_segmentos` já as resolve
    por cursor, e mesclar aqui apagaria `origem`/`categoria` de cada desvio —
    a proveniência (IA, silêncio técnico, mão do editor) é auditada depois.
    """
    juntos = [normalizar_desvio(d) for d in [*desvios_primeiro, *desvios_segundo]]
    vao = desvio_do_vao(fim_primeiro, inicio_segundo)
    if vao is not None:
        juntos.append(vao)
    juntos.sort(key=lambda d: float(d.get("inicio_seg", 0.0)))
    return juntos


def deslocar_tempos(itens: list, offset_seg: float, campos: tuple[str, ...]) -> list:
    """Soma `offset_seg` aos campos de tempo de cada item (tempo de bruto).

    Itens que não são dicionários passam intactos — a lista pode carregar lixo
    de payloads antigos e a junção não é o lugar de julgar isso.
    """
    deslocados = []
    for item in itens:
        if not isinstance(item, dict):
            deslocados.append(item)
            continue
        novo = dict(item)
        for campo in campos:
            if campo in novo:
                try:
                    novo[campo] = round(float(novo[campo]) + offset_seg, 3)
                except (TypeError, ValueError):
                    continue
        deslocados.append(novo)
    return deslocados


def emendar_texto(primeiro: str, segundo: str) -> str:
    """Emenda dois textos editoriais preservando ambos (parágrafo entre eles).

    Título e tema o corte mesclado herda do primeiro; resumo e justificativa,
    não: ali mora a matéria-prima dos metadados, e descartar a do segundo
    corte seria jogar fora trabalho de IA em silêncio.
    """
    a, b = (primeiro or "").strip(), (segundo or "").strip()
    if not b or b == a:
        return a
    return f"{a}\n\n{b}" if a else b

"""D-447: avaliação automática do BRUTO — a estrutura que sobrou após os cortes.

O voto humano por corte (D-419) diz se a PROPOSTA agradou; ele é dado antes de
o bruto existir. Falta a pergunta seguinte: depois de remover os trechos, o que
sobrou ainda se sustenta? É onde moram os defeitos que só aparecem na emenda —
resposta sem a pergunta, exemplo sem o caso, raciocínio cortado no meio.

Por isso o material desta avaliação não é a transcrição do corte, e sim a
transcrição FINAL com as emendas marcadas: cada ponto onde dois trechos
distantes viraram vizinhos é justamente onde a incoerência pode ter nascido.

A saída é fechada de propósito — nota, veredito e apontamentos com `tipo` de um
vocabulário — porque o destino dela é AGREGAR ("60% dos brutos nota ≤2 têm
apontamento de contexto_perdido") e realimentar a skill que propõe os cortes.
Parecer em texto livre não soma nem compara.

Sem I/O: montagem do material e validação da resposta. O service fala com o
banco e com o Claude.
"""

from __future__ import annotations

from dataclasses import dataclass

NOTA_MINIMA = 1
NOTA_MAXIMA = 5

# Corta parecer absurdo sem incomodar quem escreve alguns parágrafos.
LIMITE_PARECER = 4000
LIMITE_DESCRICAO = 600
LIMITE_APONTAMENTOS = 20

# Veredito estrutural — a leitura de uma linha, para filtrar lista e montar
# estatística sem depender da nota. Ordem = do melhor para o pior.
VEREDITOS: tuple[str, ...] = ("coesa", "aceitavel", "quebrada")
VEREDITO_PADRAO = "aceitavel"

# Vocabulário fechado dos defeitos. Cada tipo aponta para uma decisão distinta
# da GERAÇÃO (onde cortar, quanto remover, o que manter), para que o
# levantamento saiba o que melhorar — mesma lógica dos motivos do D-419.
TIPOS_APONTAMENTO: tuple[dict[str, str], ...] = (
    {"slug": "emenda_abrupta", "rotulo": "Emenda abrupta"},
    {"slug": "contexto_perdido", "rotulo": "Contexto perdido na remoção"},
    {"slug": "pergunta_sem_resposta", "rotulo": "Pergunta sem resposta"},
    {"slug": "raciocinio_incompleto", "rotulo": "Raciocínio não fecha"},
    {"slug": "referencia_orfa", "rotulo": "Referência a algo que foi cortado"},
    {"slug": "repeticao", "rotulo": "Repetição que sobrou"},
    {"slug": "abertura_fraca", "rotulo": "Abertura não engata"},
    {"slug": "fecho_fraco", "rotulo": "Fecho no meio do assunto"},
)

SLUGS_APONTAMENTO: tuple[str, ...] = tuple(t["slug"] for t in TIPOS_APONTAMENTO)

GRAVIDADES: tuple[str, ...] = ("leve", "media", "grave")
GRAVIDADE_PADRAO = "media"


@dataclass(frozen=True)
class Emenda:
    """Um ponto de costura no bruto: onde dois trechos distantes ficaram vizinhos.

    `posicao_seg` é o instante NO BRUTO (timeline já editada); `removido_seg` é
    quanto tempo do original sumiu ali; `motivo` é o rótulo do desvio removido.
    """

    posicao_seg: float
    removido_seg: float
    motivo: str


def _mmss(segundos: float) -> str:
    total = max(0, int(round(float(segundos or 0.0))))
    return f"{total // 60:02d}:{total % 60:02d}"


def calcular_emendas(segmentos_mantidos: list[dict], desvios: list[dict]) -> list[Emenda]:
    """Os pontos de costura entre segmentos mantidos, já na timeline do bruto.

    A transcrição final tem os tempos rebaseados, então a informação de ONDE se
    cortou não sobrevive nela — mas sobrevive nos segmentos mantidos: o fim de um
    e o começo do seguinte delimitam exatamente o buraco.

    D-576: `segmentos_mantidos` vem na ORDEM DE EXIBIÇÃO e é percorrido assim.
    Ordenar aqui era inofensivo enquanto exibição e cronologia eram a mesma
    coisa; com o arranjo de blocos apagaria justamente o salto que o avaliador
    precisa enxergar. Nem toda emenda é remoção: onde o editor só trocou a ordem
    nada foi cortado, e contar aquele vão como "tempo removido" inflaria o total
    (podendo até dar negativo num bloco que voltou para trás).

    Exemplo:
        >>> emendas = calcular_emendas(
        ...     [{"start": 10.0, "end": 40.0}, {"start": 70.0, "end": 90.0}],
        ...     [{"inicio_seg": 40.0, "fim_seg": 70.0, "motivo": "papo com o chat"}],
        ... )
        >>> emendas[0].posicao_seg, emendas[0].removido_seg, emendas[0].motivo
        (30.0, 30.0, 'papo com o chat')

    Exemplo (bloco movido para trás — costura, não corte):
        >>> emendas = calcular_emendas(
        ...     [{"start": 300.0, "end": 480.0}, {"start": 0.0, "end": 300.0}], []
        ... )
        >>> emendas[0].removido_seg, emendas[0].motivo
        (0.0, 'ordem trocada pelo editor')
    """
    emendas: list[Emenda] = []
    acumulado = 0.0

    for atual, proximo in zip(segmentos_mantidos, segmentos_mantidos[1:], strict=False):
        fim = float(atual.get("end", 0.0))
        acumulado += fim - float(atual.get("start", 0.0))
        inicio_proximo = float(proximo.get("start", 0.0))

        if _vao_apenas_mudou_de_lugar(segmentos_mantidos, fim, inicio_proximo):
            emendas.append(
                Emenda(
                    posicao_seg=round(acumulado, 2),
                    removido_seg=0.0,
                    motivo="ordem trocada pelo editor",
                )
            )
        else:
            emendas.append(
                Emenda(
                    posicao_seg=round(acumulado, 2),
                    removido_seg=round(inicio_proximo - fim, 2),
                    motivo=_motivo_do_intervalo(desvios, fim, inicio_proximo),
                )
            )
    return emendas


def _vao_apenas_mudou_de_lugar(segmentos: list[dict], inicio: float, fim: float) -> bool:
    """O material do vão `[inicio, fim]` reaparece noutro ponto da fila?

    Este é o critério exato para separar as duas emendas, e ele se decide só com
    os segmentos — sem consultar desvios, que podem estar incompletos ou
    mesclados. Se o que falta aqui toca em outro lugar do vídeo, nada foi
    removido: o bloco só mudou de posição, e contar aquele tempo como removido
    inflaria a telemetria do corte.

    Vão nulo ou negativo já é, por si, um salto de ordem — o bloco seguinte veio
    de antes na live.
    """
    if fim - inicio <= 0.05:
        return True
    return any(
        float(s.get("start", 0.0)) < fim - 0.05 and float(s.get("end", 0.0)) > inicio + 0.05
        for s in segmentos
    )


def _motivo_do_intervalo(desvios: list[dict], inicio: float, fim: float) -> str:
    """Rótulo do desvio que cobre o buraco [inicio, fim] — vazio se nenhum cobre."""
    for desvio in desvios or []:
        d_inicio = float(desvio.get("inicio_seg") or 0.0)
        d_fim = float(desvio.get("fim_seg") or 0.0)
        if d_inicio <= inicio + 0.5 and d_fim >= fim - 0.5:
            return str(desvio.get("motivo") or "").strip()
    return ""


def montar_texto_avaliado(transcricao_final: list[dict], emendas: list[Emenda]) -> str:
    """Transcrição do bruto com as emendas marcadas, pronta para o prompt.

    As falas saem com marcador `[MM:SS]` (mesmo dialeto do prompt de metadados) e
    cada costura vira uma linha explícita — é ela que o avaliador precisa julgar.

    Exemplo:
        >>> texto = montar_texto_avaliado(
        ...     [{"start": 0.0, "texto": "primeira fala"},
        ...      {"start": 30.0, "texto": "segunda fala"}],
        ...     [Emenda(posicao_seg=30.0, removido_seg=12.0, motivo="digressão")],
        ... )
        >>> "EMENDA 1" in texto
        True
    """
    marcas = sorted(emendas, key=lambda e: e.posicao_seg)
    linhas: list[str] = []
    proxima = 0

    for segmento in transcricao_final:
        inicio = float(segmento.get("start", 0.0) or 0.0)
        while proxima < len(marcas) and marcas[proxima].posicao_seg <= inicio + 0.01:
            linhas.append(_linha_de_emenda(proxima + 1, marcas[proxima]))
            proxima += 1
        texto = str(segmento.get("texto", "")).strip()
        if texto:
            linhas.append(f"[{_mmss(inicio)}] {texto}")

    for indice in range(proxima, len(marcas)):
        linhas.append(_linha_de_emenda(indice + 1, marcas[indice]))

    return "\n".join(linhas)


def _linha_de_emenda(numero: int, emenda: Emenda) -> str:
    motivo = f" — removido: {emenda.motivo}" if emenda.motivo else ""
    return (
        f"─── EMENDA {numero} · {_mmss(emenda.posicao_seg)} · "
        f"{int(round(emenda.removido_seg))}s cortados{motivo} ───"
    )


@dataclass(frozen=True)
class AvaliacaoNormalizada:
    """Resposta do avaliador já validada e pronta para persistir."""

    nota: int
    veredito: str
    parecer: str
    apontamentos: list[dict]


def normalizar_avaliacao(payload: dict) -> AvaliacaoNormalizada:
    """Valida e normaliza o JSON do avaliador; levanta `ValueError` se inútil.

    Tolerante no acessório (veredito fora do vocabulário vira o padrão,
    apontamento sem tipo conhecido é descartado) e estrito no essencial: sem
    nota válida não há avaliação, e gravar uma nota inventada contaminaria
    exatamente a estatística que motiva a funcionalidade.
    """
    if not isinstance(payload, dict):
        raise ValueError("O avaliador precisa retornar um objeto JSON.")

    nota = _nota_valida(payload.get("nota"))
    veredito = str(payload.get("veredito") or "").strip().lower()
    if veredito not in VEREDITOS:
        veredito = VEREDITO_PADRAO

    return AvaliacaoNormalizada(
        nota=nota,
        veredito=veredito,
        parecer=str(payload.get("parecer") or "").strip()[:LIMITE_PARECER],
        apontamentos=_apontamentos_validos(payload.get("apontamentos")),
    )


def _nota_valida(bruto) -> int:
    try:
        nota = int(round(float(bruto)))
    except (TypeError, ValueError) as e:
        raise ValueError(f"Nota ausente ou não numérica no retorno do avaliador: {bruto!r}") from e
    if nota < NOTA_MINIMA or nota > NOTA_MAXIMA:
        raise ValueError(f"Nota fora da faixa {NOTA_MINIMA}-{NOTA_MAXIMA}: {nota}")
    return nota


def _apontamentos_validos(bruto) -> list[dict]:
    """Apontamentos de tipo conhecido, normalizados e limitados.

    Tipo desconhecido é descartado em silêncio: o apontamento é dado de apoio à
    nota — derrubar a avaliação inteira porque o modelo inventou um slug custaria
    mais do que perder a ressalva (mesma escolha do D-419).
    """
    if not isinstance(bruto, list):
        return []

    validos: list[dict] = []
    for item in bruto:
        if not isinstance(item, dict):
            continue
        tipo = str(item.get("tipo") or "").strip()
        if tipo not in SLUGS_APONTAMENTO:
            continue
        gravidade = str(item.get("gravidade") or "").strip().lower()
        validos.append(
            {
                "tipo": tipo,
                "gravidade": gravidade if gravidade in GRAVIDADES else GRAVIDADE_PADRAO,
                "momento": str(item.get("momento") or "").strip()[:12],
                "descricao": str(item.get("descricao") or "").strip()[:LIMITE_DESCRICAO],
            }
        )
        if len(validos) >= LIMITE_APONTAMENTOS:
            break
    return validos


def rotulo_do_tipo(slug: str) -> str:
    """Rótulo legível do slug; o próprio slug quando não é do vocabulário."""
    for tipo in TIPOS_APONTAMENTO:
        if tipo["slug"] == slug:
            return tipo["rotulo"]
    return slug


def tipos_disponiveis() -> list[dict[str, str]]:
    """Vocabulário para a UI — fonte única, o front não duplica a lista."""
    return [dict(tipo) for tipo in TIPOS_APONTAMENTO]

"""As cenas do short propostas pela IA — do JSON do modelo às cenas confiáveis (D-497).

No horizontal a IA propõe as cenas desde sempre; no short o painel da D-494 só
sabia criar à mão. Este módulo é a metade que faltava: recorta a transcrição da
JANELA do short, e transforma a resposta do modelo em cenas que o renderer
aceita.

## Por que a transcrição vai rebaseada no relógio do short

`CenaShort` conta o tempo a partir do zero do short; a transcrição do bruto
conta a partir do zero do bruto. Se o prompt levasse os `[MM:SS]` do bruto, cada
cena voltaria deslocada pelo início do trecho — e o sintoma seria uma cena
aparecendo no instante errado, ou não aparecendo, sem nada apontando para a
conversão. Este projeto já pagou por esse erro uma vez, com cenas em tempo
absoluto esticando a timeline do corte.

A saída é não converter nada: a janela é recortada e zerada ANTES do prompt, o
modelo lê um relógio que começa em `00:00`, e o que ele devolve já está na
timeline certa. A conversão que não existe é a que não pode divergir.

## Por que descartar em vez de recusar

`cenas_short.normalizar_lista` levanta na primeira cena inválida — é o certo para
a tela, onde o operador escreveu aquilo e precisa saber o que corrigir. Aqui não:
uma cena torta entre quatro boas não pode custar as outras três. Cada descarte
volta com o motivo, como nas sugestões de short.

Sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.short.cenas_short import CenaInvalida, CenaShort, TipoCenaShort, normalizar
from app.domain.short.cenas_validator import verificar_sobreposicao

# Um HOOK que começa no meio do short não é um hook — é um cartão qualquer. O
# tipo promete "o que segura os 3 primeiros segundos"; esta é a folga para o
# modelo começar logo depois da primeira palavra em vez de exatamente no zero.
JANELA_DO_HOOK_SEG = 5.0

# Um CTA no começo convida a sair antes de o short ter dado motivo para ficar.
# Ele pertence ao fecho, e "fecho" aqui é a segunda metade.
FRACAO_DO_CTA = 0.5

# Tipos que existem UMA vez por short, porque são posicionais: um short tem uma
# abertura e um fecho. Dois ganchos seriam dois começos.
_TIPOS_UNICOS = (TipoCenaShort.HOOK, TipoCenaShort.CTA)


@dataclass(frozen=True)
class ResultadoCenas:
    """As cenas aprovadas + o rastro do que caiu e por quê.

    Os descartes não são erro: são o que explica ao operador por que a IA falou
    em cinco cenas e a tela mostra três.
    """

    cenas: list[CenaShort] = field(default_factory=list)
    descartes: list[str] = field(default_factory=list)


def recortar_transcricao(segmentos: list[dict], inicio_seg: float, fim_seg: float) -> list[dict]:
    """Os segmentos dentro da janela do short, com o relógio zerado nela.

    Um segmento entra se QUALQUER parte dele cai na janela — a fala que começa
    dois segundos antes do corte é a que abre o short, e deixá-la de fora daria
    ao modelo um começo que o espectador não vai ouvir.

    O `start` volta relativo ao início do short, podendo ser negativo para essa
    fala que começou antes. Zerá-lo mentiria sobre onde ela está.

    Exemplo (a fala que atravessa o corte entra com `start` negativo):
        >>> recortar_transcricao(
        ...     [
        ...         {"start": 0.0, "fim": 4.0, "texto": "longe"},
        ...         {"start": 8.0, "fim": 11.0, "texto": "atravessa"},
        ...         {"start": 12.0, "fim": 15.0, "texto": "dentro"},
        ...         {"start": 99.0, "fim": 102.0, "texto": "depois"},
        ...     ],
        ...     10.0,
        ...     20.0,
        ... )
        [{'start': -2.0, 'fim': 11.0, 'texto': 'atravessa'}, {'start': 2.0, 'fim': 15.0, 'texto': 'dentro'}]
    """
    if fim_seg <= inicio_seg:
        return []

    recortados: list[dict] = []
    for indice, segmento in enumerate(segmentos):
        comeco = _numero(segmento.get("start", segmento.get("inicio")))
        if comeco is None:
            continue
        # Sem `fim` no segmento, ele vale até o começo do próximo — é como o
        # resto do projeto lê uma transcrição por segmentos.
        termino = _numero(segmento.get("fim", segmento.get("end")))
        if termino is None:
            proximo = segmentos[indice + 1] if indice + 1 < len(segmentos) else None
            termino = _numero(proximo.get("start", proximo.get("inicio"))) if proximo else None
        if termino is None:
            termino = comeco

        if termino < inicio_seg or comeco > fim_seg:
            continue

        copia = dict(segmento)
        copia["start"] = round(comeco - inicio_seg, 2)
        copia.pop("inicio", None)
        recortados.append(copia)
    return recortados


def recortar_transcricao_varios(
    segmentos: list[dict], janelas: list[tuple[float, float, float]]
) -> list[dict]:
    """A fala de VARIAS janelas, cada uma no lugar que ocupa no short (D-604).

    Existe porque um short passou a poder ser uma colagem de pedacos
    descontinuos, e todo consumidor de IA daqui — as cenas, o gancho, o post, a
    etiqueta da capa — recebia a janela inteira `[inicio, fim]`.

    Com buraco no meio, aquela janela inclui a fala que o operador TIROU FORA. O
    defeito nao seria um erro: seria o modelo prometendo no gancho um assunto que
    o video nao contem, e ninguem ligando uma coisa a outra.

    Cada janela e `(inicio, fim, offset)` — onde ela pega no bruto e em que
    instante do SHORT ela entra. A ordem e a das janelas (o short pode abrir com
    o pedaco que vem depois na live); a saida sai ordenada pelo tempo do short.

    Exemplo — a fala dos 12s abre, e a dos 2s vem depois:
        >>> fala = [
        ...     {"start": 2.0, "fim": 4.0, "texto": "primeira"},
        ...     {"start": 12.0, "fim": 14.0, "texto": "segunda"},
        ... ]
        >>> recortar_transcricao_varios(fala, [(10.0, 20.0, 0.0), (0.0, 5.0, 10.0)])
        [{'start': 2.0, 'fim': 14.0, 'texto': 'segunda'}, {'start': 12.0, 'fim': 4.0, 'texto': 'primeira'}]

    Uma janela so devolve o mesmo que `recortar_transcricao`:
        >>> recortar_transcricao_varios(fala, [(0.0, 5.0, 0.0)])
        [{'start': 2.0, 'fim': 4.0, 'texto': 'primeira'}]
    """
    recortados: list[dict] = []
    for inicio, fim, offset in janelas:
        for copia in recortar_transcricao(segmentos, inicio, fim):
            copia["start"] = round(copia["start"] + offset, 2)
            recortados.append(copia)
    return sorted(recortados, key=lambda c: c["start"])


def normalizar_sugestoes(resposta: object, *, duracao_short: float) -> ResultadoCenas:
    """Valida o JSON do modelo e devolve as cenas utilizáveis, em ordem de tempo.

    Aceita ``{"cenas": [...]}`` ou a lista crua — modelos escorregam no
    invólucro, e recusar por causa disso jogaria fora um conteúdo bom.

    Exemplo:
        >>> resultado = normalizar_sugestoes(
        ...     {
        ...         "cenas": [
        ...             {"tipo": "hook", "inicio": 0, "fim": 3, "texto": "olha isso"},
        ...             {"tipo": "cta", "inicio": 1, "fim": 4, "texto": "assista"},
        ...         ]
        ...     },
        ...     duracao_short=30.0,
        ... )
        >>> [c.tipo.value for c in resultado.cenas]
        ['hook']
        >>> resultado.descartes
        ['cena 2 (cta): um CTA a 1.0s convida a sair antes de o short entregar algo']
    """
    itens = _extrair_itens(resposta)
    descartes: list[str] = []

    aceitas: list[CenaShort] = []
    for indice, item in enumerate(itens):
        cena, motivo = _validar(item, indice, duracao_short)
        if cena is None:
            descartes.append(motivo)
            continue
        aceitas.append(cena)

    aceitas.sort(key=lambda c: c.inicio)
    finais, recusadas = _sem_conflito(aceitas)
    descartes.extend(recusadas)
    return ResultadoCenas(cenas=finais, descartes=descartes)


def _validar(item: object, indice: int, duracao_short: float) -> tuple[CenaShort | None, str]:
    rotulo = f"cena {indice + 1}"
    if not isinstance(item, dict):
        return None, f"{rotulo}: veio como {type(item).__name__}, não como objeto"

    try:
        cena = normalizar(item, duracao_short)
    except CenaInvalida as exc:
        return None, f"{rotulo}: {exc}"

    rotulo = f"{rotulo} ({cena.tipo.value})"
    if cena.tipo is TipoCenaShort.HOOK and cena.inicio > JANELA_DO_HOOK_SEG:
        return None, (
            f"{rotulo}: um gancho que começa em {cena.inicio:.1f}s já perdeu quem ia passar"
        )
    if cena.tipo is TipoCenaShort.CTA and cena.inicio < duracao_short * FRACAO_DO_CTA:
        return None, (
            f"{rotulo}: um CTA a {cena.inicio:.1f}s convida a sair antes de o short entregar algo"
        )
    return cena, ""


def _sem_conflito(cenas: list[CenaShort]) -> tuple[list[CenaShort], list[str]]:
    """Remove sobreposições e repetições de tipo posicional, guardando o motivo.

    Vence quem vem ANTES no tempo. Não é gosto: as cenas chegam ordenadas, e a
    primeira é a que o espectador já estaria lendo quando a segunda tentasse
    aparecer por cima.
    """
    aprovadas: list[CenaShort] = []
    recusadas: list[str] = []
    vistos: set[TipoCenaShort] = set()

    for cena in cenas:
        if cena.tipo in _TIPOS_UNICOS and cena.tipo in vistos:
            recusadas.append(f"cena em {cena.inicio:.1f}s ({cena.tipo.value}): o short já tem uma")
            continue

        anterior = next(
            (
                a
                for a in aprovadas
                if verificar_sobreposicao(
                    {"inicio": a.inicio, "fim": a.fim},
                    {"inicio": cena.inicio, "fim": cena.fim},
                )
            ),
            None,
        )
        if anterior is not None:
            recusadas.append(
                f"cena em {cena.inicio:.1f}s ({cena.tipo.value}): taparia a de "
                f"{anterior.inicio:.1f}s"
            )
            continue

        aprovadas.append(cena)
        vistos.add(cena.tipo)
    return aprovadas, recusadas


def _extrair_itens(resposta: object) -> list:
    if isinstance(resposta, dict):
        for chave in ("cenas", "scenes", "items"):
            valor = resposta.get(chave)
            if isinstance(valor, list):
                return valor
        return []
    return resposta if isinstance(resposta, list) else []


def _numero(valor: object) -> float | None:
    try:
        return float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None

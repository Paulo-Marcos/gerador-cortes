"""Arranjo de blocos — a ORDEM em que o material do corte toca (D-576).

## O problema

Na live o assunto sai fora de ordem: o convidado antecipa uma conclusão, volta
ao contexto, e só depois fecha o raciocínio. O corte fica correto no conteúdo e
torto no argumento. Até aqui o editor só tinha duas saídas — cortar fora (virar
desvio) ou aceitar a bagunça.

## A ideia

O bruto do corte JÁ é uma colagem: `calcular_segmentos` parte o intervalo nos
pedaços que sobram depois dos desvios, e `bruto_pipeline` concatena um a um. A
ordem dessa colagem era cronológica por acidente — ninguém nunca precisou de
outra. Este módulo torna a ordem uma DECISÃO.

Um `Bloco` é uma fatia do corte em tempo de LIVE (tempo da fonte, não do bruto).
O `arranjo` é a lista de blocos NA ORDEM EM QUE TOCAM. É a mesma ideia da EDL de
um editor não-linear: a mídia não se move, move-se o ponteiro.

## A invariante que segura tudo

**O arranjo é uma PERMUTAÇÃO: os blocos, reordenados cronologicamente, ladrilham
exatamente `[inicio_seg, fim_seg]` do corte — sem buraco, sem sobreposição.**

Ela não é burocracia; é o que torna o resto barato:

- Arranjo não remove conteúdo (isso é trabalho do desvio) nem inventa conteúdo.
  Trocar a ordem nunca muda a duração do corte.
- Mexer na borda do corte tem conserto óbvio (`reconciliar`): estica a ponta.
- Um tempo da live cai em no máximo um bloco — o que deixa o remapeamento da
  transcrição determinístico mesmo com a ordem embaralhada.

Arranjo VAZIO é o caso normal e significa "ordem cronológica". Ausência como
herança, não default materializado: corte que nunca foi reordenado não carrega
arranjo nenhum, e o pipeline se comporta exatamente como antes do D-576.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.domain.corte.segment_calculator import calcular_segmentos

# Coberto e esperado vêm arredondados a 0,1 s: um passo de diferença é arredondamento.
_TOLERANCIA_DE_COBERTURA_SEG = 0.1

# Bloco mais curto que isso é lixo de arredondamento, não decisão editorial —
# o mesmo limiar que `calcular_segmentos` usa para micro-fatias.
DURACAO_MINIMA_SEG = 0.1

# Folga para comparar bordas de blocos vindas de floats diferentes (o fim de um
# e o início do outro nascem do mesmo corte, mas passam por rounds distintos).
TOLERANCIA_BORDA_SEG = 0.05


@dataclass(frozen=True)
class Bloco:
    """Uma fatia do corte em tempo de LIVE."""

    inicio_seg: float
    fim_seg: float

    @property
    def duracao_seg(self) -> float:
        return round(self.fim_seg - self.inicio_seg, 3)

    def para_dict(self) -> dict:
        return {"inicio_seg": self.inicio_seg, "fim_seg": self.fim_seg}


def _arredondar(valor: float) -> float:
    return round(float(valor), 3)


def bloco_unico(inicio_seg: float, fim_seg: float) -> list[Bloco]:
    """O arranjo trivial: um bloco cobrindo o corte inteiro (ordem cronológica)."""
    return [Bloco(_arredondar(inicio_seg), _arredondar(fim_seg))]


def parse(bruto: object) -> list[Bloco]:
    """Lê o arranjo persistido, descartando entrada malformada em vez de explodir.

    Arranjo corrompido é tratado como ausente — o corte volta ao cronológico, que
    é sempre uma resposta válida. Perder a ordem é incômodo; derrubar a geração
    do bruto é pior.

    Exemplo:
        >>> parse([{"inicio_seg": 10, "fim_seg": 20}])
        [Bloco(inicio_seg=10.0, fim_seg=20.0)]
        >>> parse("nao e json")
        []
    """
    if isinstance(bruto, str):
        try:
            bruto = json.loads(bruto or "[]")
        except (json.JSONDecodeError, TypeError):
            return []

    if not isinstance(bruto, list):
        return []

    blocos: list[Bloco] = []
    for item in bruto:
        if not isinstance(item, dict):
            continue
        try:
            inicio = _arredondar(item["inicio_seg"])
            fim = _arredondar(item["fim_seg"])
        except (KeyError, TypeError, ValueError):
            continue
        if fim - inicio < DURACAO_MINIMA_SEG:
            continue
        blocos.append(Bloco(inicio, fim))
    return blocos


def serializar(blocos: list[Bloco]) -> list[dict]:
    """Forma persistível/transportável do arranjo, preservando a ORDEM."""
    return [b.para_dict() for b in blocos]


def eh_cronologico(blocos: list[Bloco]) -> bool:
    """True quando o arranjo não altera nada — a ordem já é a da live.

    Vale para arranjo vazio e para arranjo fatiado mas nunca movido: em ambos o
    bruto sai idêntico ao de antes do D-576.
    """
    if not blocos:
        return True
    return all(a.inicio_seg <= b.inicio_seg for a, b in zip(blocos, blocos[1:], strict=False))


def validar(blocos: list[Bloco], inicio_seg: float, fim_seg: float) -> list[str]:
    """Erros que quebram a invariante de permutação — lista vazia é arranjo são.

    Exemplo:
        >>> validar([Bloco(0, 30), Bloco(30, 100)], 0, 100)
        []
        >>> validar([Bloco(0, 30)], 0, 100)
        ['o arranjo cobre 30.0s dos 100.0s do corte']
    """
    if not blocos:
        return []

    inicio = _arredondar(inicio_seg)
    fim = _arredondar(fim_seg)
    erros: list[str] = []

    for bloco in blocos:
        if bloco.duracao_seg < DURACAO_MINIMA_SEG:
            erros.append(f"bloco {bloco.inicio_seg}s→{bloco.fim_seg}s é curto demais")
        if (
            bloco.inicio_seg < inicio - TOLERANCIA_BORDA_SEG
            or bloco.fim_seg > fim + TOLERANCIA_BORDA_SEG
        ):
            erros.append(f"bloco {bloco.inicio_seg}s→{bloco.fim_seg}s sai do corte")

    ordenados = sorted(blocos, key=lambda b: b.inicio_seg)
    for anterior, atual in zip(ordenados, ordenados[1:], strict=False):
        if atual.inicio_seg < anterior.fim_seg - TOLERANCIA_BORDA_SEG:
            erros.append(f"blocos se sobrepõem em {atual.inicio_seg}s")
        elif atual.inicio_seg > anterior.fim_seg + TOLERANCIA_BORDA_SEG:
            erros.append(f"buraco entre {anterior.fim_seg}s e {atual.inicio_seg}s")

    coberto = round(sum(b.duracao_seg for b in blocos), 1)
    esperado = round(fim - inicio, 1)
    if abs(coberto - esperado) > _TOLERANCIA_DE_COBERTURA_SEG and not erros:
        erros.append(f"o arranjo cobre {coberto}s dos {esperado}s do corte")

    return erros


def dividir(
    blocos: list[Bloco], ponto_seg: float, inicio_seg: float, fim_seg: float
) -> list[Bloco]:
    """Passa a lâmina em `ponto_seg`: o bloco que contém o ponto vira dois.

    A metade nova entra LOGO DEPOIS da original na ordem — dividir não reordena,
    só cria a junta por onde a reordenação passa a ser possível. Ponto fora de
    qualquer bloco, ou rente demais a uma borda, devolve o arranjo intacto.

    Exemplo:
        >>> dividir([], 180, 0, 480)
        [Bloco(inicio_seg=0.0, fim_seg=180.0), Bloco(inicio_seg=180.0, fim_seg=480.0)]
    """
    atual = blocos or bloco_unico(inicio_seg, fim_seg)
    ponto = _arredondar(ponto_seg)

    resultado: list[Bloco] = []
    for bloco in atual:
        cabe = bloco.inicio_seg + DURACAO_MINIMA_SEG <= ponto <= bloco.fim_seg - DURACAO_MINIMA_SEG
        if cabe:
            resultado.append(Bloco(bloco.inicio_seg, ponto))
            resultado.append(Bloco(ponto, bloco.fim_seg))
        else:
            resultado.append(bloco)
    return resultado


def fundir(blocos: list[Bloco], indice: int) -> list[Bloco]:
    """Desfaz uma junta: o bloco em `indice` volta a ser um só com o vizinho da LIVE.

    O vizinho é o bloco que continua onde este termina em tempo de live — não o
    da lista ao lado, que pode ter vindo de outro ponto do corte. O fundido
    assume a posição mais à frente entre os dois, para que desfazer uma divisão
    nunca jogue conteúdo para trás sem o editor pedir.
    """
    if indice < 0 or indice >= len(blocos):
        return blocos

    alvo = blocos[indice]
    vizinho = next(
        (
            i
            for i, b in enumerate(blocos)
            if i != indice and abs(b.inicio_seg - alvo.fim_seg) < TOLERANCIA_BORDA_SEG
        ),
        None,
    )
    if vizinho is None:
        return blocos

    fundido = Bloco(alvo.inicio_seg, blocos[vizinho].fim_seg)
    posicao = min(indice, vizinho)
    resultado = [b for i, b in enumerate(blocos) if i not in (indice, vizinho)]
    resultado.insert(posicao, fundido)
    return resultado


def mover(blocos: list[Bloco], de_indice: int, para_indice: int) -> list[Bloco]:
    """Tira o bloco de uma posição e o encaixa em outra — o gesto da demanda.

    Exemplo (os 3 min finais vão para o começo):
        >>> a = [Bloco(0, 180), Bloco(180, 300), Bloco(300, 480)]
        >>> [b.inicio_seg for b in mover(a, 2, 0)]
        [300.0, 0.0, 180.0]
    """
    if not blocos or de_indice == para_indice:
        return blocos
    if not (0 <= de_indice < len(blocos)) or not (0 <= para_indice < len(blocos)):
        return blocos

    resultado = list(blocos)
    resultado.insert(para_indice, resultado.pop(de_indice))
    return resultado


def reconciliar(blocos: list[Bloco], inicio_seg: float, fim_seg: float) -> list[Bloco]:
    """Reencaixa o arranjo depois que as bordas do corte mudaram.

    Mexer no `inicio_hms`/`fim_hms`, dividir o corte em dois, limitar o fim à
    duração real do vídeo — tudo isso invalida um arranjo antigo. Em vez de
    descartá-lo (o editor perderia o trabalho) ou confiar nele (o ffmpeg cortaria
    fora do arquivo), esticamos as fatias para voltar a ladrilhar o novo
    intervalo, PRESERVANDO A ORDEM escolhida.

    Bloco que ficou inteiramente fora do novo intervalo desaparece; se não sobrar
    nenhum, o corte volta ao cronológico.
    """
    inicio = _arredondar(inicio_seg)
    fim = _arredondar(fim_seg)
    if fim - inicio < DURACAO_MINIMA_SEG or not blocos:
        return []

    # Recorta ao novo intervalo, guardando a posição de cada sobrevivente.
    recortados: list[tuple[int, Bloco]] = []
    for posicao, bloco in enumerate(blocos):
        novo_inicio = max(bloco.inicio_seg, inicio)
        novo_fim = min(bloco.fim_seg, fim)
        if novo_fim - novo_inicio >= DURACAO_MINIMA_SEG:
            recortados.append((posicao, Bloco(_arredondar(novo_inicio), _arredondar(novo_fim))))

    if not recortados:
        return bloco_unico(inicio, fim)

    # Estica as fatias em tempo de live até fecharem o intervalo sem buraco.
    por_origem = sorted(recortados, key=lambda par: par[1].inicio_seg)
    costurados: list[tuple[int, Bloco]] = []
    cursor = inicio
    for indice, (posicao, bloco) in enumerate(por_origem):
        limite = fim if indice == len(por_origem) - 1 else bloco.fim_seg
        costurados.append((posicao, Bloco(cursor, limite)))
        cursor = limite

    costurados.sort(key=lambda par: par[0])
    return [bloco for _, bloco in costurados]


def concatenar(
    primeiro: list[Bloco],
    segundo: list[Bloco],
    inicio_primeiro: float,
    fim_primeiro: float,
    inicio_segundo: float,
    fim_segundo: float,
) -> list[Bloco]:
    """A ordem do corte que nasce da junção de dois (D-575 + D-576).

    Cada metade guarda a ordem que o editor escolheu para ela, e a primeira toca
    inteira antes da segunda — que é o que "juntar este corte com o seguinte"
    significa. O vão entre os dois vira um bloco próprio, porque a invariante
    exige ladrilhar o span inteiro; ele sai do vídeo mesmo assim, pelo desvio que
    a junção cria ali.

    Se NENHUM dos dois tinha arranjo, o resultado também não tem: dois cortes
    cronológicos somam um corte cronológico, e materializar blocos aqui só criaria
    dado sem informação.
    """
    if not primeiro and not segundo:
        return []

    esquerda = reconciliar(
        primeiro or bloco_unico(inicio_primeiro, fim_primeiro), inicio_primeiro, fim_primeiro
    )
    direita = reconciliar(
        segundo or bloco_unico(inicio_segundo, fim_segundo), inicio_segundo, fim_segundo
    )

    vao: list[Bloco] = []
    if inicio_segundo - fim_primeiro >= DURACAO_MINIMA_SEG:
        vao = [Bloco(_arredondar(fim_primeiro), _arredondar(inicio_segundo))]

    return esquerda + vao + direita


def segmentos_na_ordem(
    blocos: list[Bloco],
    inicio_seg: float,
    fim_seg: float,
    desvios: list[dict],
) -> list[dict]:
    """Os pedaços que o ffmpeg vai concatenar, JÁ na ordem de exibição.

    É a ponte entre as duas decisões que o editor toma em lugares diferentes: o
    arranjo diz a ORDEM, os desvios dizem o que SAI. Cada bloco é subtraído dos
    seus próprios desvios, e o resultado entra na fila na posição do bloco.

    Sem arranjo, é literalmente `calcular_segmentos` do corte inteiro — o
    caminho de antes do D-576, preservado.

    Exemplo (dois blocos trocados, com um silêncio dentro do que era o primeiro):
        >>> segmentos_na_ordem(
        ...     [Bloco(300, 480), Bloco(0, 300)], 0, 480,
        ...     [{"inicio_seg": 100, "fim_seg": 150}],
        ... )
        [{'start': 300.0, 'end': 480.0}, {'start': 0.0, 'end': 100.0}, {'start': 150.0, 'end': 300.0}]
    """
    if not blocos:
        return calcular_segmentos(inicio_seg, fim_seg, desvios)

    segmentos: list[dict] = []
    for bloco in blocos:
        segmentos.extend(
            calcular_segmentos(bloco.inicio_seg, bloco.fim_seg, desvios, fallback=False)
        )

    # Desvios que engoliram tudo: o corte não pode sair vazio, e o intervalo
    # cheio é a mesma rede de segurança que `calcular_segmentos` sempre teve.
    if not segmentos:
        return [{"start": _arredondar(inicio_seg), "end": _arredondar(fim_seg)}]
    return _costurar_contiguos(segmentos)


def duracao_liquida(bloco: Bloco, desvios: list[dict]) -> float:
    """Quanto sobra DESTE bloco depois dos desvios que o atravessam.

    É o número que o editor precisa ver na fila: um bloco de 3 min com 1 min de
    silêncio removido ocupa 2 min no vídeo, e mostrar os 3 min faria a soma da
    fila não bater com a duração do bruto. Sem a rede de segurança do corte —
    bloco inteiramente removido vale zero, e não o intervalo cheio.
    """
    segmentos = calcular_segmentos(bloco.inicio_seg, bloco.fim_seg, desvios, fallback=False)
    return round(sum(float(s["end"]) - float(s["start"]) for s in segmentos), 3)


def _costurar_contiguos(segmentos: list[dict]) -> list[dict]:
    """Funde segmentos vizinhos na fila que também eram vizinhos na live.

    Fatiar o corte em blocos e NÃO movê-los não pode custar nada: sem isto, um
    corte dividido em 5 blocos intocados viraria 5 partes no ffmpeg em vez de
    uma, com 4 emendas a mais para o concat colar — e o drift do bruto cresce com
    o número de partes. Com a costura, "dividido mas não movido" sai idêntico ao
    corte de antes do D-576.

    Exemplo:
        >>> _costurar_contiguos([{"start": 0.0, "end": 180.0}, {"start": 180.0, "end": 480.0}])
        [{'start': 0.0, 'end': 480.0}]
    """
    costurados: list[dict] = [dict(segmentos[0])]
    for segmento in segmentos[1:]:
        anterior = costurados[-1]
        if abs(float(segmento["start"]) - float(anterior["end"])) < TOLERANCIA_BORDA_SEG:
            anterior["end"] = segmento["end"]
        else:
            costurados.append(dict(segmento))
    return costurados

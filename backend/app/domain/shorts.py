"""Domínio puro dos shorts — validação e normalização das sugestões da IA (D-454).

O modelo devolve JSON; este módulo transforma isso em candidatos confiáveis. É
aqui que moram as regras que não podem depender da boa vontade do LLM:

  - tempo fora do bruto não existe (o recorte usaria um arquivo que acabou antes);
  - duração fora da faixa não é short (curto demais não entrega, longo demais é
    o corte de novo);
  - dois candidatos sobre a mesma fala são um candidato só;
  - nota é escala fechada de 0 a 10, e ela é o que ordena a fila do operador.

Sem I/O, sem SQLAlchemy, sem cliente externo — só as regras.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.time_convert import to_seg

# Folga para o `fim` que passa do fim do bruto por arredondamento do modelo.
# Acima disso o candidato é descartado em vez de aparado: erro grande em tempo
# costuma significar que o modelo leu a transcrição errada, não que errou por
# uma casa decimal.
_TOLERANCIA_FIM_SEG = 1.0

_NOTA_MINIMA = 0.0
_NOTA_MAXIMA = 10.0


@dataclass(frozen=True)
class FaixaShort:
    """Os limites que o operador aceita para um candidato a short.

    Defaults alinhados à decisão do dev: 5 a 8 candidatos, de 15 a 90 segundos —
    15-30s serve Reels, até 90s serve conteúdo denso.
    """

    duracao_min_seg: float = 15.0
    duracao_max_seg: float = 90.0
    quantidade_min: int = 5
    quantidade_max: int = 8

    @property
    def duracao_humana(self) -> str:
        """Como a faixa é escrita no prompt.

        Exemplo:
            >>> FaixaShort().duracao_humana
            '15 a 90 segundos'
        """
        return f"{int(self.duracao_min_seg)} a {int(self.duracao_max_seg)} segundos"

    @property
    def quantidade_humana(self) -> str:
        """Como o alvo de volume é escrito no prompt.

        Exemplo:
            >>> FaixaShort().quantidade_humana
            '5 a 8'
        """
        return f"{self.quantidade_min} a {self.quantidade_max}"


@dataclass(frozen=True)
class SugestaoShort:
    """Um candidato já validado, na timeline do BRUTO."""

    titulo: str
    gancho: str
    inicio_seg: float
    fim_seg: float
    score: float
    justificativa: str

    @property
    def duracao_seg(self) -> float:
        """Exemplo:
        >>> SugestaoShort("t", "g", 10.0, 45.0, 8.0, "j").duracao_seg
        35.0
        """
        return round(self.fim_seg - self.inicio_seg, 2)


@dataclass(frozen=True)
class ResultadoSugestoes:
    """As sugestões aprovadas + o rastro do que caiu e por quê.

    Os descartes não são erro: são o que explica ao operador por que a IA falou
    em oito trechos e a tela mostra quatro.
    """

    sugestoes: list[SugestaoShort] = field(default_factory=list)
    descartes: list[str] = field(default_factory=list)


def normalizar_sugestoes(
    resposta: object,
    *,
    duracao_bruto_seg: float,
    faixa: FaixaShort | None = None,
) -> ResultadoSugestoes:
    """Valida o JSON do modelo e devolve os candidatos utilizáveis, do melhor ao pior.

    Aceita tanto ``{"shorts": [...]}`` quanto a lista crua — modelos escorregam
    entre as duas formas e recusar por isso seria perder uma geração inteira.

    Exemplo:
        >>> resultado = normalizar_sugestoes(
        ...     {"shorts": [
        ...         {"titulo": "A", "inicio": "00:10", "fim": "00:40", "score": 9},
        ...         {"titulo": "B", "inicio": "00:20", "fim": "00:50", "score": 7},
        ...     ]},
        ...     duracao_bruto_seg=600.0,
        ... )
        >>> [s.titulo for s in resultado.sugestoes]
        ['A']
        >>> resultado.descartes
        ['B: sobrepõe um candidato de nota maior']
    """
    faixa = faixa or FaixaShort()
    itens = _extrair_itens(resposta)
    descartes: list[str] = []

    candidatos: list[SugestaoShort] = []
    for indice, item in enumerate(itens):
        candidato, motivo = _validar_item(item, indice, duracao_bruto_seg, faixa)
        if candidato is None:
            descartes.append(motivo)
            continue
        candidatos.append(candidato)

    candidatos.sort(key=lambda c: (-c.score, c.inicio_seg))
    aprovados = _sem_sobreposicao(candidatos, descartes)

    if len(aprovados) > faixa.quantidade_max:
        for excedente in aprovados[faixa.quantidade_max :]:
            descartes.append(f"{_rotulo(excedente)}: além do teto de {faixa.quantidade_max}")
        aprovados = aprovados[: faixa.quantidade_max]

    return ResultadoSugestoes(sugestoes=aprovados, descartes=descartes)


def _extrair_itens(resposta: object) -> list[dict]:
    if isinstance(resposta, dict):
        bruto = resposta.get("shorts", [])
    else:
        bruto = resposta
    if not isinstance(bruto, list):
        return []
    return [item for item in bruto if isinstance(item, dict)]


def _validar_item(
    item: dict, indice: int, duracao_bruto_seg: float, faixa: FaixaShort
) -> tuple[SugestaoShort | None, str]:
    """O candidato validado, ou ``None`` + o motivo do descarte."""
    titulo = str(item.get("titulo", "")).strip()
    gancho = str(item.get("gancho", "")).strip()
    rotulo = titulo or gancho or f"candidato {indice + 1}"

    if not titulo and not gancho:
        return None, f"{rotulo}: sem título nem gancho"

    inicio = max(0.0, to_seg(item.get("inicio")))
    fim = to_seg(item.get("fim"))

    if duracao_bruto_seg > 0:
        if fim > duracao_bruto_seg + _TOLERANCIA_FIM_SEG:
            return None, f"{rotulo}: termina depois do fim do bruto"
        fim = min(fim, duracao_bruto_seg)

    duracao = round(fim - inicio, 2)
    if duracao <= 0:
        return None, f"{rotulo}: intervalo vazio ou invertido"
    if duracao < faixa.duracao_min_seg:
        return None, f"{rotulo}: {duracao:g}s é menos que o mínimo de {faixa.duracao_min_seg:g}s"
    if duracao > faixa.duracao_max_seg:
        return None, f"{rotulo}: {duracao:g}s passa do máximo de {faixa.duracao_max_seg:g}s"

    return (
        SugestaoShort(
            titulo=titulo or gancho,
            gancho=gancho,
            inicio_seg=round(inicio, 2),
            fim_seg=round(fim, 2),
            score=_nota(item.get("score")),
            justificativa=str(item.get("justificativa", "")).strip(),
        ),
        "",
    )


def _nota(valor: object) -> float:
    """Nota coagida para a escala fechada 0-10 (fora dela, o modelo inventou).

    Exemplos:
        >>> _nota("8,5")
        8.5
        >>> _nota(42)
        10.0
        >>> _nota(None)
        0.0
    """
    try:
        nota = float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return _NOTA_MINIMA
    return round(min(max(nota, _NOTA_MINIMA), _NOTA_MAXIMA), 2)


def _sem_sobreposicao(candidatos: list[SugestaoShort], descartes: list[str]) -> list[SugestaoShort]:
    """Mantém, entre candidatos que dividem a mesma fala, só o de maior nota.

    Depende de `candidatos` já vir ordenado por nota decrescente: o primeiro a
    ocupar um intervalo é, por construção, o melhor daquele trecho.
    """
    aprovados: list[SugestaoShort] = []
    for candidato in candidatos:
        if any(_colidem(candidato, aceito) for aceito in aprovados):
            descartes.append(f"{_rotulo(candidato)}: sobrepõe um candidato de nota maior")
            continue
        aprovados.append(candidato)
    return aprovados


def _colidem(a: SugestaoShort, b: SugestaoShort) -> bool:
    return a.inicio_seg < b.fim_seg and b.inicio_seg < a.fim_seg


def _rotulo(sugestao: SugestaoShort) -> str:
    return sugestao.titulo or sugestao.gancho

"""Domínio: alcance de fases do pipeline de render final.

Permite executar apenas um subconjunto **contíguo** das fases do render
(ex.: "só a grade", "só os overlays") para corrigir falhas pontuais sem
refazer o pipeline inteiro — caso clássico: a grade saiu com 2 min quando
deveria ter 10, regenera-se só a grade e mantêm-se os overlays já prontos.

Puro: sem FFmpeg, sem I/O, sem SQLAlchemy. As regras de execução ficam
testáveis isoladamente; `pipeline_render` apenas consome estas funções.

Conceitos:
- `start_from`: a primeira fase a (re)executar (já existente no pipeline).
- `parar_em`:   a última fase a executar. `None` = roda até o fim (vídeo
  final). Quando `parar_em` é uma fase intermediária, o render é *parcial*:
  o pipeline não finaliza o corte (não marca PROCESSADO).
"""

ORDEM_FASES = {"grade": 1, "overlays": 2, "render_final": 3}

# Aliases legados de retomada: antes "compose"/"encode" eram fases distintas;
# hoje ambas mapeiam para a passada única "render_final".
_ALIAS_FASES = {"compose": "render_final", "encode": "render_final"}


def normalizar_fase(fase: str | None) -> str | None:
    """Mapeia aliases (`compose`, `encode`) para a fase canônica `render_final`.

    Mantém `None` como `None` (sem limite) e devolve nomes desconhecidos
    inalterados para o chamador decidir o que fazer.
    """
    if fase is None:
        return None
    return _ALIAS_FASES.get(fase, fase)


def fase_dentro_do_alcance(fase: str, parar_em: str | None) -> bool:
    """`True` se `fase` deve executar dado o limite superior `parar_em`.

    O limite é inclusivo. `parar_em=None` (ou desconhecido) → sem limite,
    todas as fases rodam.

    >>> fase_dentro_do_alcance("overlays", "grade")
    False
    >>> fase_dentro_do_alcance("grade", "grade")
    True
    >>> fase_dentro_do_alcance("render_final", None)
    True
    """
    limite = normalizar_fase(parar_em)
    if limite is None or limite not in ORDEM_FASES:
        return True
    alvo = normalizar_fase(fase)
    return ORDEM_FASES.get(alvo, 0) <= ORDEM_FASES[limite]


def eh_render_parcial(parar_em: str | None) -> bool:
    """`True` quando o pipeline para antes de produzir o vídeo final.

    Render parcial não deve finalizar o corte (não marca PROCESSADO nem
    gera o pacote de upload), pois `upload_ready/video.mp4` não foi (re)feito.

    >>> eh_render_parcial("grade")
    True
    >>> eh_render_parcial("render_final")
    False
    >>> eh_render_parcial(None)
    False
    """
    limite = normalizar_fase(parar_em)
    return limite in ORDEM_FASES and limite != "render_final"

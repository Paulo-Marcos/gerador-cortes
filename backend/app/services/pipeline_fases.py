"""Decisões de fase e limpeza de artefatos do pipeline de render.

Extraído de `pipeline_render` (E-006). Funções puras que decidem, a partir de
`start_from`/`continuar`/`parar_em`, o que pular, o que limpar e como nomear o
arquivo temporário do vídeo final. Sem I/O de worker — só filesystem local.
"""

import logging
import shutil
from pathlib import Path

from app.domain.render_etapas import fase_dentro_do_alcance

logger = logging.getLogger(__name__)

# Pipeline opera em 3 fases (render) + 1 finalização. Os aliases "compose"
# e "encode" mapeiam para "render_final": antes eram duas fases distintas
# (composição → clip_composed.mp4 → encode → video.mp4); hoje é uma passada
# só. Mantemos os aliases para preservar a UX de retomada via start_from.
_ORDEM_FASES = {"grade": 1, "overlays": 2, "render_final": 3}
_ALIAS_FASES = {"compose": "render_final", "encode": "render_final"}


def _normalizar_fase_alias(fase: str) -> str:
    """Mapeia aliases (`compose`, `encode`) para a fase canônica `render_final`."""
    return _ALIAS_FASES.get(fase, fase)


def _deve_limpar_artefatos(*, continuar: bool, start_from: str) -> bool:
    """Decide se `_limpar_a_partir_de` deve rodar antes do pipeline.

    Regras:
    - `continuar=False` → sempre limpa (re-render total).
    - `start_from='auto'` + `continuar=True` → não limpa (skip artefatos prontos
      em cada fase via `_deve_pular_fase` / `_filtrar_chunks_pendentes`).
    - `start_from='overlays'` + `continuar=True` → **não limpa**. É o modo
      "Continuar Fase 2": preserva chunks já renderizados; quando o pipeline
      morre no chunk N, basta retomar e só os faltantes/falhos rodam.
    - Outros `start_from` explícitos com `continuar=True` → limpa (usuário
      pediu reinício deliberado daquele ponto).
    """
    if not continuar:
        return True
    if start_from == "auto":
        return False
    if _normalizar_fase_alias(start_from) == "overlays":
        return False
    return True


def _deve_pular_fase(
    fase: str,
    start_from: str,
    continuar: bool,
    artefato_valido: bool,
) -> bool:
    """Decide se a fase pode ser pulada (artefato pronto + retomada autoriza)."""
    if not artefato_valido:
        return False
    if start_from == "auto":
        return continuar

    fase_norm = _normalizar_fase_alias(fase)
    start_norm = _normalizar_fase_alias(start_from)
    return _ORDEM_FASES.get(fase_norm, 0) < _ORDEM_FASES.get(start_norm, 0)


def _arquivo_minimo(path: Path, min_bytes: int) -> bool:
    return path.exists() and path.stat().st_size >= min_bytes


def _limpar_a_partir_de(
    start_from: str,
    graded_dir: Path,
    overlays_dir: Path,
    video_final: Path,
    parar_em: str | None = None,
    continuar: bool = False,
) -> None:
    """Remove artefatos da fase escolhida em diante.

    `start_from` aceita os nomes canônicos (`grade`, `overlays`,
    `render_final`) ou os aliases legados (`compose`, `encode`).

    `parar_em` limita a faixa de limpeza ao alcance pedido: num render
    parcial "só a grade" (start_from='grade', parar_em='grade') apagamos
    apenas `graded/`, preservando os overlays já renderizados.

    `continuar` (reaproveitar) preserva os overlays mesmo ao reiniciar pela
    grade: o caso "deu problema na grade, mas os overlays já terminaram" —
    refaz só a grade e reusa os overlays prontos (eles são transparentes e
    independem do conteúdo da grade). Só apagamos os overlays num reinício
    total da grade (`continuar=False`, "refazer do zero").
    """
    fase = _normalizar_fase_alias(start_from)
    if fase not in _ORDEM_FASES:
        fase = "grade"

    if fase == "grade":
        # Overlays só são apagados num reinício total pela grade (refazer do
        # zero). Com `continuar` (reaproveitar) ou `parar_em='grade'`, eles
        # ficam intactos para o compose final reutilizá-los.
        dirs_a_limpar = [graded_dir]
        if fase_dentro_do_alcance("overlays", parar_em) and not continuar:
            dirs_a_limpar.append(overlays_dir)
        for d in dirs_a_limpar:
            if d.exists():
                shutil.rmtree(str(d), ignore_errors=True)
            d.mkdir(parents=True, exist_ok=True)
    elif fase == "overlays":
        if overlays_dir.exists():
            shutil.rmtree(str(overlays_dir), ignore_errors=True)
        overlays_dir.mkdir(parents=True, exist_ok=True)
    # O video_final fica publicado; apenas sobras temporarias sao removidas.
    _remover_arquivo_temporario(_video_final_temporario(video_final))


def _video_final_temporario(video_final: Path) -> Path:
    return video_final.with_name(f"{video_final.stem}.rendering{video_final.suffix}")


def _remover_arquivo_temporario(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except PermissionError:
        logger.warning("[Pipeline] Arquivo temporario ainda em uso: %s", path)

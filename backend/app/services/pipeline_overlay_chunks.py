"""Modelo de chunks de overlay: agrupamento de cenas, timing relativo,
política de falha total e resolução dos arquivos para a composição final.

Extraído de `pipeline_render` (E-006). Funções puras — só operam sobre as
`OverlayEntry`/chunks e o filesystem de saída dos overlays.
"""

import logging
from pathlib import Path

from app.domain.overlay_metadata import OverlayEntry

logger = logging.getLogger(__name__)

_OVERLAY_CHUNK_MAX_SEC = 30
_OVERLAY_CHUNK_MAX_GAP_SEC = 8
# Fração de overlays FALTANDO (chunks que esgotaram os retries) a partir da
# qual a fase de overlays FALHA ALTO em vez de concluir "sucesso". D-167: com
# o Chrome Headless quebrado, 100% dos chunks falhavam e a fase seguia emitindo
# `fase_concluida` — mascarando o problema por dias. A partir de 50% de overlays
# ausentes o vídeo final sai gravemente incompleto; abaixo disso mantemos a
# resiliência a falha pontual de 1 chunk isolado (registrado como ausente).
_OVERLAY_FAIL_ABORT_RATIO = 0.5
# Extensões de overlay já usadas/aceitas em projetos existentes.
# A render atual usa a extensão do codec configurado; durante a
# resolução para composição aceitamos qualquer extensão conhecida
# (permite reaproveitar artefatos legados sem re-renderizar tudo).
_OVERLAY_EXTENSIONS_LEGADAS = (".webm", ".mov")


def _agrupar_overlay_chunks(entries: list[OverlayEntry]) -> list[dict]:
    """Agrupa cenas proximas em chunks transparentes para reduzir renders Remotion."""
    chunks: list[dict] = []
    current: list[OverlayEntry] = []

    for entry in entries:
        if not current:
            current = [entry]
            continue

        chunk_start = current[0].start_sec
        last_end = current[-1].end_sec
        would_duration = entry.end_sec - chunk_start
        gap = entry.start_sec - last_end

        if would_duration > _OVERLAY_CHUNK_MAX_SEC or gap > _OVERLAY_CHUNK_MAX_GAP_SEC:
            chunks.append(_criar_overlay_chunk(len(chunks) + 1, current))
            current = [entry]
        else:
            current.append(entry)

    if current:
        chunks.append(_criar_overlay_chunk(len(chunks) + 1, current))

    return chunks


def _criar_overlay_chunk(index: int, entries: list[OverlayEntry]) -> dict:
    start_sec = min(entry.start_sec for entry in entries)
    end_sec = max(entry.end_sec for entry in entries)
    return {
        "id": f"{index:03d}",
        "start_sec": start_sec,
        "end_sec": end_sec,
        "entries": entries,
    }


def _construir_cenas_chunk_relativas(
    chunk_start_sec: float,
    entries: list[OverlayEntry],
) -> list[dict]:
    """Reescreve as 4 chaves de timing de cada cena (`inicio`, `fim`,
    `inicio_seg`, `fim_seg`) para coordenadas relativas ao início do chunk.

    Por que as 4 chaves: o `normalizarCenaRemotion` em
    `video-renderer/src/schema.ts` prefere `inicio_seg`/`fim_seg` sobre
    `inicio`/`fim`. Se mantivermos as `_seg` originais do banco (absolutas)
    junto com `inicio`/`fim` relativos, a composição Remotion posiciona o
    `<Sequence>` em frames fora do chunk — o primeiro chunk renderiza com
    atraso e os subsequentes ficam completamente vazios.

    Invariante crítica: `cena["inicio"] == cena["inicio_seg"]` e
    `cena["fim"] == cena["fim_seg"]` em toda cena produzida aqui. Os testes
    cobrem essa invariante explicitamente.
    """
    cenas: list[dict] = []
    for entry in entries:
        inicio_rel = max(0.0, entry.start_sec - chunk_start_sec)
        fim_rel = max(0.001, entry.end_sec - chunk_start_sec)
        cenas.append(
            {
                **entry.cena_dict,
                "inicio": inicio_rel,
                "fim": fim_rel,
                "inicio_seg": inicio_rel,
                "fim_seg": fim_rel,
            }
        )
    return cenas


def _mensagem_falha_total_overlays(
    falhados: list[tuple[str, BaseException]],
    total_overlays: int,
) -> str | None:
    """Decide se a fase de overlays deve FALHAR ALTO e devolve a mensagem acionável.

    A fração de overlays FALTANDO é medida contra o total de overlays do corte
    (`total_overlays`), não contra o subconjunto re-renderizado: no modo
    "continuar" só re-rendermos os chunks pendentes, e falhar um deles quando
    dezenas de overlays válidos já existem não deve derrubar o vídeo.

    Retorna:
    - `str` (mensagem de erro) quando a fração faltando atinge
      `_OVERLAY_FAIL_ABORT_RATIO` — caso do bug D-167, em que 100% dos chunks
      falhavam mas a fase concluía "sucesso".
    - `None` quando a falha é pontual (tolerada), preservando a resiliência
      a um chunk isolado, que segue registrado como ausente + warning.
    """
    if not falhados or total_overlays <= 0:
        return None
    fracao = len(falhados) / total_overlays
    if fracao < _OVERLAY_FAIL_ABORT_RATIO:
        return None
    ids = ", ".join(fid for fid, _ in falhados)
    return (
        f"Fase de overlays falhou: {len(falhados)}/{total_overlays} chunks não "
        f"foram gerados ({fracao:.0%} ≥ {_OVERLAY_FAIL_ABORT_RATIO:.0%}) [{ids}]. "
        "Nenhum (ou quase nenhum) overlay foi produzido — verifique o Chrome "
        "Headless do Remotion (bin/ensure-remotion-browser) e o log do worker."
    )


def _resolver_overlays_para_composicao(
    overlay_chunks: list[dict],
    overlays_dir: Path,
) -> tuple[list[Path], list[dict]]:
    """Para cada chunk, escolhe entre o arquivo agrupado ou os `ov_*`
    individuais (fallback histórico). Aceita extensões legadas: se o
    chunk foi renderizado em ProRes (.mov) antes da mudança para VP9
    (.webm), continua usável sem re-renderizar.
    """
    overlay_paths: list[Path] = []
    overlay_timings: list[dict] = []

    for chunk in overlay_chunks:
        chunk_path = _localizar_overlay_existente(overlays_dir, f"chunk_{chunk['id']}")
        if chunk_path is not None:
            overlay_paths.append(chunk_path)
            overlay_timings.append({"start_sec": chunk["start_sec"], "end_sec": chunk["end_sec"]})
            continue

        for entry in chunk["entries"]:
            fallback_path = _localizar_overlay_existente(overlays_dir, f"ov_{entry.id}")
            if fallback_path is None:
                logger.warning(
                    "[Pipeline] Overlay chunk/individual nao encontrado (ext esperadas: %s): %s",
                    list(_OVERLAY_EXTENSIONS_LEGADAS),
                    overlays_dir / f"ov_{entry.id}.*",
                )
                continue
            overlay_paths.append(fallback_path)
            overlay_timings.append({"start_sec": entry.start_sec, "end_sec": entry.end_sec})

    return overlay_paths, overlay_timings


def _localizar_overlay_existente(overlays_dir: Path, stem: str) -> Path | None:
    """Retorna o primeiro `overlays_dir/<stem><ext>` que existe entre as
    extensões conhecidas, ou None se nenhum existe."""
    for ext in _OVERLAY_EXTENSIONS_LEGADAS:
        candidato = overlays_dir / f"{stem}{ext}"
        if candidato.exists():
            return candidato
    return None

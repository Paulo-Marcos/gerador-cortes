"""Até onde o render de um corte já chegou, lido nos arquivos do disco (D-705).

O pipeline grava cada fase numa pasta do corte — bruto, grade, overlays,
composição, vídeo final. Esta leitura diz quais fases têm artefato aproveitável
(grande o bastante para não ser resto de uma falha), para a tela oferecer
"continuar" em vez de recomeçar. Morava no router de cortes.
"""

from __future__ import annotations

from pathlib import Path

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.models import Corte
from app.services.render.render_progress import RenderProgressStore


async def situacao_do_pipeline(corte_id: str) -> dict:
    """As fases com artefato aproveitável, os overlays prontos e o progresso do render."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado")

    paths = _pipeline_paths(corte)
    overlays = (
        [
            p
            for pattern in ("chunk_*.webm", "chunk_*.mov", "ov_*.webm", "ov_*.mov")
            for p in paths["overlays_dir"].glob(pattern)
            if _overlay_aproveitavel(p)
        ]
        if paths["overlays_dir"].exists()
        else []
    )
    fases = {
        "raw": (
            _arquivo_aproveitavel(paths["raw_mkv"])
            or _arquivo_aproveitavel(paths["raw_mp4"])
            or _bruto_registrado_aproveitavel(corte)
        ),
        "grade": _grade_aproveitavel(paths),
        "overlays": len(overlays) > 0,
        "compose": _arquivo_aproveitavel(paths["composed"]),
        "render_final": _arquivo_aproveitavel(paths["final"]),
        "encode": _arquivo_aproveitavel(paths["final"]),
    }
    progress = RenderProgressStore.get(corte_id).to_dict()
    if progress["state"] == "idle" and fases["encode"]:
        progress = {
            "state": "done",
            "progress": 100,
            "stage": "Render final concluído",
            "running": False,
            "elapsed_seconds": 0.0,
            "error": "",
        }
    return {
        "fases": fases,
        "overlays_count": len(overlays),
        "tem_etapas_concluidas": any(fases[k] for k in ("grade", "overlays", "compose", "encode")),
        **progress,
    }


def _pipeline_paths(corte: Corte) -> dict[str, Path]:
    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
    graded_dir = corte_dir / "graded"
    return {
        "raw_mkv": corte_dir / "clip_raw.mkv",
        "raw_mp4": corte_dir / "clip_raw.mp4",
        "graded": graded_dir / "clip_graded.mp4",
        "graded_dir": graded_dir,
        "overlays_dir": corte_dir / "overlays",
        "composed": corte_dir / "temp" / "clip_composed.mp4",
        "final": corte_dir / "upload_ready" / "video.mp4",
    }


def _arquivo_aproveitavel(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 1024 * 1024


# D-093: a otimizacao de trim-segmentation grava `clip_graded.seg*.ts` +
# `clip_graded.concat.txt` durante a fase 1; o `.mp4` final so nasce no
# concat. Sem reconhecer os segmentos, `pipeline-status` reporta grade
# inexistente e o frontend dispara restart total a cada clique.
_SEG_MIN_BYTES_APROVEITAVEL = 256 * 1024


def _grade_aproveitavel(paths: dict[str, Path]) -> bool:
    if _arquivo_aproveitavel(paths["graded"]):
        return True
    graded_dir = paths.get("graded_dir")
    if graded_dir is None or not graded_dir.exists():
        return False
    concat = graded_dir / "clip_graded.concat.txt"
    if not concat.exists():
        return False
    return any(
        seg.stat().st_size > _SEG_MIN_BYTES_APROVEITAVEL
        for seg in graded_dir.glob("clip_graded.seg*.ts")
    )


def _bruto_registrado_aproveitavel(corte: Corte) -> bool:
    if not corte.arquivo_clip_path:
        return False

    return _arquivo_aproveitavel(resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id))


def _overlay_aproveitavel(path: Path) -> bool:
    # 256 KB casa com `_OVERLAY_MIN_BYTES_PRONTO` em pipeline_render. Render
    # incompleto/corrompido geralmente tem <100 KB; chunks curtos válidos
    # podem ficar bem abaixo dos 10 MB que usávamos antes — usar 10 MB aqui
    # escondia da UI a opção "Continuar fase 2" quando havia overlays prontos.
    return path.exists() and path.stat().st_size > 256 * 1024

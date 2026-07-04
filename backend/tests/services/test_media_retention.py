from pathlib import Path

from app.models import Corte, Projeto
from app.services import media_retention as media_retention_module
from app.services.media_retention import MediaRetentionService


def _arquivo(path: Path, size: int = 32) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    return path


def _video_aproveitavel(path: Path) -> Path:
    return _arquivo(path, size=1024 * 1024 + 1)


def _corte(projeto_id: str, corte_id: str, raw_path: Path | None = None) -> Corte:
    return Corte(
        id=corte_id,
        projeto_id=projeto_id,
        numero=1,
        arquivo_clip_path=str(raw_path) if raw_path else "",
    )


def test_apos_grade_remove_raw_e_preserva_upload_ready(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    raw = _arquivo(corte_dir / "clip_raw.mkv")
    graded = _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    upload = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    overlay = _arquivo(corte_dir / "overlays" / "chunk_001.webm")
    event_log = _arquivo(corte_dir / "pipeline_events.jsonl")
    corte = _corte("p1", "c1", raw)

    report = MediaRetentionService.aplicar_apos_grade(corte)

    assert not raw.exists()
    assert upload.exists()
    assert graded.exists()
    assert overlay.exists()
    assert event_log.exists()
    assert corte.arquivo_clip_path == ""
    assert any("clip_raw.mkv" in item for item in report.removidos)


def test_apos_upload_remove_raw_e_video_final_preservando_materiais(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    raw = _arquivo(corte_dir / "clip_raw_123.mkv")
    graded = _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    upload_video = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    thumbnail = _arquivo(corte_dir / "upload_ready" / "thumbnail.jpg")
    metadata = _arquivo(corte_dir / "upload_ready" / "metadados.txt")
    overlay = _arquivo(corte_dir / "overlays" / "chunk_001.webm")
    preview = _arquivo(corte_dir / "versoes" / "cinematic_iii" / "preview.mp4")
    versao_completa = _arquivo(corte_dir / "versoes" / "cinematic_iii" / "video.mp4")
    versoes_dir = corte_dir / "versoes"
    corte = _corte("p1", "c1", raw)

    report = MediaRetentionService.aplicar_apos_upload(corte)

    assert not raw.exists()
    assert not upload_video.exists()
    assert not preview.exists()
    assert not versao_completa.exists()
    assert not versoes_dir.exists()
    assert graded.exists()
    assert thumbnail.exists()
    assert metadata.exists()
    assert overlay.exists()
    assert corte.arquivo_clip_path == ""
    assert any("upload_ready" in item and "video.mp4" in item for item in report.removidos)
    assert any(item.endswith("versoes/") for item in report.removidos)


def test_sem_graded_valido_preserva_raw_e_upload_ready(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    raw = _arquivo(corte_dir / "clip_raw.mkv")
    upload_video = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    preview = _arquivo(corte_dir / "versoes" / "cinematic_iii" / "preview.mp4")
    versao_completa = _arquivo(corte_dir / "versoes" / "cinematic_iii" / "video.mp4")
    versoes_dir = corte_dir / "versoes"
    _arquivo(corte_dir / "graded" / "clip_graded.mp4", size=10)
    corte = _corte("p1", "c1", raw)

    report = MediaRetentionService.aplicar_apos_upload(corte)

    assert raw.exists()
    assert upload_video.exists()
    assert not preview.exists()
    assert not versao_completa.exists()
    assert not versoes_dir.exists()
    assert corte.arquivo_clip_path == str(raw)
    assert any(item.endswith("versoes/") for item in report.removidos)
    assert report.pulados


def test_limpeza_projeto_remove_original_sem_apagar_pasta_cortes(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    projeto_dir = tmp_path / "p1"
    original = _video_aproveitavel(projeto_dir / "video.mkv")
    corte_dir = projeto_dir / "cortes" / "c1"
    raw = _arquivo(corte_dir / "clip_raw.mp4")
    graded = _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    overlay = _arquivo(corte_dir / "overlays" / "chunk_001.webm")
    upload_video = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    metadata = _arquivo(corte_dir / "upload_ready" / "metadados.txt")
    preview = _arquivo(corte_dir / "versoes" / "paleta_punch" / "preview.mp4")
    versao_completa = _arquivo(corte_dir / "versoes" / "paleta_punch" / "video.mp4")
    versoes_dir = corte_dir / "versoes"
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x", arquivo_video_path=str(original))
    corte = _corte("p1", "c1", raw)

    report = MediaRetentionService.limpar_projeto(projeto, [corte])

    assert not original.exists()
    assert not raw.exists()
    assert not upload_video.exists()
    assert not preview.exists()
    assert not versao_completa.exists()
    assert not versoes_dir.exists()
    assert (projeto_dir / "cortes").exists()
    assert graded.exists()
    assert overlay.exists()
    assert metadata.exists()
    assert projeto.arquivo_video_path == ""
    assert report.liberado_mb > 0

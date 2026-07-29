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


def test_apos_upload_remove_video_final_preservando_bruto_e_materiais(monkeypatch, tmp_path):
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

    # D-430: nem o upload conclui o descarte do bruto — so `limpar_projeto`.
    assert raw.exists()
    assert not upload_video.exists()
    assert not preview.exists()
    assert not versao_completa.exists()
    assert not versoes_dir.exists()
    assert graded.exists()
    assert thumbnail.exists()
    assert metadata.exists()
    assert overlay.exists()
    assert corte.arquivo_clip_path == str(raw)
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


def test_limpeza_projeto_zera_midia_pesada_e_preserva_metadados(monkeypatch, tmp_path):
    """D-398: a limpeza terminal leva TODA a midia e deixa so o que documenta o trabalho."""
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    projeto_dir = tmp_path / "p1"
    original = _video_aproveitavel(projeto_dir / "video.mkv")
    proxy = _video_aproveitavel(projeto_dir / "proxies" / "c1_audio.flac")
    legenda = _arquivo(projeto_dir / "subtitles" / "live.vtt")
    capa = _arquivo(projeto_dir / "thumbnails" / "capa.png")
    corte_dir = projeto_dir / "cortes" / "c1"
    raw = _arquivo(corte_dir / "clip_raw.mp4")
    graded = _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    overlay = _video_aproveitavel(corte_dir / "overlays" / "chunk_001.mov")
    # Video com nome editorial livre, fora de qualquer padrao `clip_raw*`.
    editorial = _video_aproveitavel(corte_dir / "01_O_Erro_de_Plato.mkv")
    # Scratch do ExportService, que ninguem removia.
    rerender = _video_aproveitavel(corte_dir / "tmp_rerender_c1_bruto_ab12" / "part_000.mkv")
    upload_video = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    metadata = _arquivo(corte_dir / "upload_ready" / "metadados.txt")
    thumb = _arquivo(corte_dir / "upload_ready" / "thumbnail.jpg")
    eventos = _arquivo(corte_dir / "pipeline_events.jsonl")
    preview = _arquivo(corte_dir / "versoes" / "paleta_punch" / "preview.mp4")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x", arquivo_video_path=str(original))
    corte = _corte("p1", "c1", raw)

    report = MediaRetentionService.limpar_projeto(projeto, [corte])

    for removido in (original, proxy, raw, graded, overlay, editorial, rerender, upload_video):
        assert not removido.exists(), removido
    assert not preview.exists()
    assert not (corte_dir / "versoes").exists()
    assert not (corte_dir / "tmp_rerender_c1_bruto_ab12").exists()
    assert not (projeto_dir / "proxies").exists()

    for preservado in (legenda, capa, metadata, thumb, eventos):
        assert preservado.exists(), preservado
    assert (projeto_dir / "cortes").exists()

    assert projeto.arquivo_video_path == ""
    assert corte.arquivo_clip_path == ""
    assert report.liberado_mb > 0
    assert not report.pulados
    assert not report.erros


def test_limpeza_projeto_reporta_pulado_quando_midia_sobrevive(monkeypatch, tmp_path):
    """Sobra de midia vira `pulados` — e o que segura `arquivos_limpos` em falso."""
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    projeto_dir = tmp_path / "p1"
    _video_aproveitavel(projeto_dir / "video.mkv")
    travado = _video_aproveitavel(projeto_dir / "cortes" / "c1" / "graded" / "clip_graded.mp4")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x")

    real_unlink = Path.unlink

    def unlink_com_arquivo_em_uso(self, *args, **kwargs):
        if self.name == travado.name:
            raise PermissionError("arquivo em uso por outro processo")
        return real_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink_com_arquivo_em_uso)

    report = MediaRetentionService.limpar_projeto(projeto, [])

    assert travado.exists()
    assert not (projeto_dir / "video.mkv").exists()
    assert report.erros
    assert any("clip_graded.mp4" in item for item in report.pulados)


def test_limpeza_projeto_sem_id_nao_varre_a_raiz_de_dados(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    de_outro_projeto = _video_aproveitavel(tmp_path / "p9" / "video.mkv")
    projeto = Projeto(id="", youtube_url="https://youtu.be/x")

    report = MediaRetentionService.limpar_projeto(projeto, [])

    assert de_outro_projeto.exists()
    assert report.freed_bytes == 0
    assert report.erros


def test_limpeza_projeto_sem_pasta_no_disco_nao_quebra(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    projeto = Projeto(id="inexistente", youtube_url="https://youtu.be/x")

    report = MediaRetentionService.limpar_projeto(projeto, [])

    assert report.freed_bytes == 0
    assert not report.pulados
    assert not report.erros

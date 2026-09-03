from datetime import datetime
from pathlib import Path

from app.models import Corte, MetadadoCorte, Projeto
from app.services import media_retention as media_retention_module
from app.services.media_retention import MediaRetentionService


def _arquivo(path: Path, size: int = 32) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x" * size)
    return path


def _video_aproveitavel(path: Path) -> Path:
    return _arquivo(path, size=1024 * 1024 + 1)


def _corte(
    projeto_id: str,
    corte_id: str,
    raw_path: Path | None = None,
    *,
    no_youtube: bool = True,
    no_tiktok: bool = True,
) -> Corte:
    """Um corte, por padrao JA PUBLICADO nos dois destinos.

    D-512: o default e "publicado" porque e o unico estado em que a retencao de
    meio de pipeline pode apagar o MP4 — os testes que checam a remocao querem
    esse cenario, e os que checam a PRESERVACAO dizem explicitamente o que
    falta.
    """
    return Corte(
        id=corte_id,
        projeto_id=projeto_id,
        numero=1,
        arquivo_clip_path=str(raw_path) if raw_path else "",
        youtube_video_id="abc123" if no_youtube else "",
        tiktok_publicado_em=datetime(2026, 9, 3) if no_tiktok else None,
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


# --------------------------------------------------------------------------- #
# D-456 — o bruto do corte Fire e materia-prima da fabrica de shorts (E-030).
# Limpar a live junto destruiria a unica fonte de onde os shorts sao recortados.
# --------------------------------------------------------------------------- #


def _corte_fire(projeto_id: str, corte_id: str, raw_path: Path, *, fire: bool) -> Corte:
    corte = _corte(projeto_id, corte_id, raw_path)
    corte.metadado = MetadadoCorte(id=f"m-{corte_id}", corte_id=corte_id, is_fire=fire)
    return corte


def test_limpeza_poupa_o_bruto_do_corte_fire_e_leva_o_resto(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    projeto_dir = tmp_path / "p1"
    original = _video_aproveitavel(projeto_dir / "video.mkv")
    corte_dir = projeto_dir / "cortes" / "c1"
    raw = _video_aproveitavel(corte_dir / "clip_raw_123.mkv")
    graded = _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x", arquivo_video_path=str(original))
    corte = _corte_fire("p1", "c1", raw, fire=True)

    report = MediaRetentionService.limpar_projeto(projeto, [corte])

    assert raw.exists(), "o bruto do Fire e a materia-prima dos shorts"
    assert not original.exists()
    assert not graded.exists()
    # Preservado NAO e pulado: em `pulados` o projeto nunca mais seria limpo.
    assert any("bruto de corte Fire" in item for item in report.preservados)
    assert not report.pulados
    assert report.retido_mb > 0


def test_corte_comum_continua_perdendo_o_bruto(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    raw = _video_aproveitavel(corte_dir / "clip_raw_123.mkv")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x")
    corte = _corte_fire("p1", "c1", raw, fire=False)

    report = MediaRetentionService.limpar_projeto(projeto, [corte])

    assert not raw.exists()
    assert report.retido_bytes == 0


def test_operador_pode_pedir_o_disco_de_volta_explicitamente(monkeypatch, tmp_path):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    raw = _video_aproveitavel(corte_dir / "clip_raw_123.mkv")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x")
    corte = _corte_fire("p1", "c1", raw, fire=True)

    report = MediaRetentionService.limpar_projeto(projeto, [corte], preservar_brutos_fire=False)

    assert not raw.exists()
    assert report.retido_bytes == 0


def test_ponteiro_do_bruto_preservado_nao_e_zerado_no_banco(monkeypatch, tmp_path):
    """O arquivo sobreviveu, entao `arquivo_clip_path` tem de continuar apontando.

    `resolver_do_projeto` (D-172) reancora o path relativo na raiz de dados
    vigente, entao o dublê precisa valer tambem em `channel_paths` — senao a
    checagem de existencia procuraria na raiz real e zeraria o ponteiro.
    """
    from app import channel_paths

    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    _video_aproveitavel(corte_dir / "clip_raw_123.mkv")
    projeto = Projeto(id="p1", youtube_url="https://youtu.be/x")
    corte = _corte_fire("p1", "c1", Path("cortes/c1/clip_raw_123.mkv"), fire=True)

    MediaRetentionService.limpar_projeto(projeto, [corte])

    assert corte.arquivo_clip_path, "o ponteiro do bruto poupado nao pode ser zerado"
    assert channel_paths.resolver_do_projeto(corte.arquivo_clip_path, "p1").exists()


# ── D-512: o MP4 de publicacao espera TODOS os destinos ────────────────────
#
# O bug em producao: a retencao apagava `upload_ready/video.mp4` no fim do
# upload do YouTube. O TikTok sobe o MESMO arquivo, entao publicar num
# inviabilizava o outro — e refazer exige render novo.


def _cenario(monkeypatch, tmp_path, **destinos):
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    _video_aproveitavel(corte_dir / "graded" / "clip_graded.mp4")
    mp4 = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    corte = _corte("p1", "c1", _arquivo(corte_dir / "clip_raw.mkv"), **destinos)
    return corte, mp4


def test_publicado_so_no_youtube_preserva_o_mp4(monkeypatch, tmp_path):
    """A REGRESSAO exata: era aqui que o arquivo do TikTok desaparecia."""
    corte, mp4 = _cenario(monkeypatch, tmp_path, no_youtube=True, no_tiktok=False)

    report = MediaRetentionService.aplicar_apos_upload(corte)

    assert mp4.exists(), "o MP4 que o TikTok ainda vai subir foi apagado"
    assert any("TikTok" in item for item in report.pulados)


def test_publicado_so_no_tiktok_tambem_preserva(monkeypatch, tmp_path):
    """Simetrico: o YouTube pode ter falhado e ir ser reenviado."""
    corte, mp4 = _cenario(monkeypatch, tmp_path, no_youtube=False, no_tiktok=True)

    MediaRetentionService.aplicar_apos_upload(corte)

    assert mp4.exists()


def test_sem_destino_nenhum_preserva(monkeypatch, tmp_path):
    """O pior caso possivel seria apagar antes da PRIMEIRA publicacao."""
    corte, mp4 = _cenario(monkeypatch, tmp_path, no_youtube=False, no_tiktok=False)

    MediaRetentionService.aplicar_apos_upload(corte)

    assert mp4.exists()


def test_com_os_dois_publicados_o_mp4_sai(monkeypatch, tmp_path):
    """A limpeza automatica continua existindo — so espera a vez dela."""
    corte, mp4 = _cenario(monkeypatch, tmp_path, no_youtube=True, no_tiktok=True)

    report = MediaRetentionService.aplicar_apos_upload(corte)

    assert not mp4.exists()
    assert any("upload_ready" in item and "video.mp4" in item for item in report.removidos)


def test_o_motivo_da_preservacao_entra_no_relatorio(monkeypatch, tmp_path):
    """ "Nao apaguei" sem explicacao vira suspeita de bug — e a suspeita
    anterior custou um arquivo apagado antes da hora."""
    corte, _ = _cenario(monkeypatch, tmp_path, no_youtube=True, no_tiktok=False)

    report = MediaRetentionService.aplicar_apos_upload(corte)

    assert any("falta publicar em: TikTok" in item for item in report.pulados)


def test_a_limpeza_terminal_nao_espera_destino(monkeypatch, tmp_path):
    """O botao da biblioteca e o operador dizendo que acabou.

    Amarra-lo aos destinos deixaria o disco preso por um TikTok que ele nunca
    vai publicar — e era justamente a saida que ele pediu.
    """
    from app.models import Projeto

    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    mp4 = _video_aproveitavel(corte_dir / "upload_ready" / "video.mp4")
    corte = _corte("p1", "c1", None, no_youtube=False, no_tiktok=False)

    MediaRetentionService.limpar_projeto(Projeto(id="p1", youtube_url="u"), [corte])

    assert not mp4.exists()

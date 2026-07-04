"""Garante que a grade com decode QSV (Fase 3) cai para decode em software se a
fonte nao for decodavel pela GPU — um render nunca pode quebrar por causa disso.
"""

from pathlib import Path

import app.services.pipeline_render as pr
import pytest
from app.infrastructure.worker_queue import WorkerJobFailed, WorkerJobTimeout


@pytest.mark.asyncio
async def test_grade_qsv_falha_cai_para_software(tmp_path, monkeypatch):
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _sem_palco(*a, **k):
        return {}

    monkeypatch.setattr(pr, "ensure_palco_pngs_para_layout", _sem_palco)

    chamadas: list[bool] = []

    async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **kwargs):
        usou_qsv = "-hwaccel" in cmd
        chamadas.append(usou_qsv)
        if usou_qsv:
            raise WorkerJobFailed("QSV decode falhou (fonte exotica)")
        # decode software: sucesso

    monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)

    # Nao deve levantar: QSV falha -> refaz em software.
    await pr._executar_grade(tmp_path / "in.mkv", tmp_path / "out.mp4", "cinematic_iii")

    assert chamadas == [True, False], f"esperava [QSV, software], veio {chamadas}"


@pytest.mark.asyncio
async def test_grade_qsv_ok_nao_refaz(tmp_path, monkeypatch):
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _sem_palco(*a, **k):
        return {}

    monkeypatch.setattr(pr, "ensure_palco_pngs_para_layout", _sem_palco)

    chamadas: list[bool] = []

    async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **kwargs):
        chamadas.append("-hwaccel" in cmd)
        # sucesso na 1a (QSV)

    monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)

    await pr._executar_grade(tmp_path / "in.mkv", tmp_path / "out.mp4", "cinematic_iii")

    assert chamadas == [True], "QSV funcionou; nao deveria ter refeito em software"


@pytest.mark.asyncio
async def test_grade_timeout_qsv_tambem_cai_para_software(tmp_path, monkeypatch):
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _sem_palco(*a, **k):
        return {}

    monkeypatch.setattr(pr, "ensure_palco_pngs_para_layout", _sem_palco)

    chamadas: list[bool] = []

    async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **kwargs):
        usou_qsv = "-hwaccel" in cmd
        chamadas.append(usou_qsv)
        if usou_qsv:
            raise WorkerJobTimeout("QSV travou")

    monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)

    await pr._executar_grade(tmp_path / "in.mkv", tmp_path / "out.mp4", "cinematic_iii")

    assert chamadas == [True, False]


@pytest.mark.asyncio
async def test_grade_segmentado_escreve_lista_roda_passos_e_limpa(tmp_path, monkeypatch):
    """Orquestracao do plano segmentado no _executar_grade: escreve a lista do
    concat ANTES dos passos, executa cada passo na ordem (job_id unico) e remove
    os temporarios (.ts + .txt) ao fim."""
    from app.domain.ffmpeg_commands import GradePlan, GradeStep

    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _sem_palco(*a, **k):
        return {}

    monkeypatch.setattr(pr, "ensure_palco_pngs_para_layout", _sem_palco)

    out = tmp_path / "clip_graded.mp4"
    seg0 = tmp_path / "clip_graded.seg000.ts"
    seg1 = tmp_path / "clip_graded.seg001.ts"
    lista = tmp_path / "clip_graded.concat.txt"
    plan = GradePlan(
        steps=[
            GradeStep(["ffmpeg", "seg0", str(seg0)], "seg000"),
            GradeStep(["ffmpeg", "seg1", str(seg1)], "seg001"),
            GradeStep(["ffmpeg", "concat", str(out)], "concat"),
        ],
        concat_list=(lista, "file 'clip_graded.seg000.ts'\nfile 'clip_graded.seg001.ts'\n"),
        temp_files=[seg0, seg1, lista],
        segmentado=True,
    )
    monkeypatch.setattr(pr, "build_grade_plan", lambda *a, **k: plan)

    jobs: list[str] = []

    async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **kwargs):
        jobs.append(job_id)
        if job_id.endswith("_concat"):
            assert lista.read_text().startswith("file '")  # lista escrita antes
        if cmd[-1].endswith(".ts"):
            Path(cmd[-1]).write_text("x")  # cria o segmento p/ o cleanup apagar

    monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)

    await pr._executar_grade(tmp_path / "in.mkv", out, "cinematic_iii")

    assert jobs == ["clip_graded_seg000", "clip_graded_seg001", "clip_graded_concat"]
    assert not seg0.exists() and not seg1.exists() and not lista.exists()

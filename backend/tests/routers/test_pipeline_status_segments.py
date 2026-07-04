"""D-093: pipeline-status reconhece os segmentos `.seg*.ts` + `.concat.txt`
gerados pela otimizacao de trim-segmentation como grade aproveitavel.

Sem isso, `fases.grade` ficava False mesmo com a grade quase concluida e o
frontend disparava restart total a cada clique em "Renderizar".
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers import cortes as cortes_router


def _corte_mock(corte_id="corte-1", projeto_id="projeto-1"):
    corte = MagicMock()
    corte.id = corte_id
    corte.projeto_id = projeto_id
    corte.arquivo_clip_path = ""
    return corte


def _db_mock(corte):
    db = AsyncMock()
    db.get = AsyncMock(return_value=corte)
    return db


def _graded_dir(tmp_path, projeto_id="projeto-1", corte_id="corte-1"):
    graded = tmp_path / projeto_id / "cortes" / corte_id / "graded"
    graded.mkdir(parents=True)
    return graded


# ─── Helper puro ────────────────────────────────────────────────────────────


class TestGradeAproveitavel:
    def test_clip_graded_mp4_grande_basta(self, tmp_path):
        graded = _graded_dir(tmp_path)
        (graded / "clip_graded.mp4").write_bytes(b"\x00" * (2 * 1024 * 1024))
        paths = {"graded": graded / "clip_graded.mp4", "graded_dir": graded}

        assert cortes_router._grade_aproveitavel(paths) is True

    def test_segmentos_com_concat_contam_como_grade_pronta(self, tmp_path):
        graded = _graded_dir(tmp_path)
        (graded / "clip_graded.concat.txt").write_text(
            "file 'clip_graded.seg000.ts'\nfile 'clip_graded.seg001.ts'\n",
            encoding="utf-8",
        )
        (graded / "clip_graded.seg000.ts").write_bytes(b"\x00" * (512 * 1024))
        (graded / "clip_graded.seg001.ts").write_bytes(b"\x00" * (512 * 1024))
        paths = {"graded": graded / "clip_graded.mp4", "graded_dir": graded}

        assert cortes_router._grade_aproveitavel(paths) is True

    def test_segmentos_sem_concat_nao_contam(self, tmp_path):
        graded = _graded_dir(tmp_path)
        (graded / "clip_graded.seg000.ts").write_bytes(b"\x00" * (512 * 1024))
        paths = {"graded": graded / "clip_graded.mp4", "graded_dir": graded}

        assert cortes_router._grade_aproveitavel(paths) is False

    def test_segmento_minusculo_nao_conta(self, tmp_path):
        graded = _graded_dir(tmp_path)
        (graded / "clip_graded.concat.txt").write_text("file 'x'\n", encoding="utf-8")
        (graded / "clip_graded.seg000.ts").write_bytes(b"\x00" * 1024)
        paths = {"graded": graded / "clip_graded.mp4", "graded_dir": graded}

        assert cortes_router._grade_aproveitavel(paths) is False

    def test_diretorio_inexistente(self, tmp_path):
        graded = tmp_path / "vazio" / "graded"
        paths = {"graded": graded / "clip_graded.mp4", "graded_dir": graded}

        assert cortes_router._grade_aproveitavel(paths) is False


# ─── Integracao do endpoint ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pipeline_status_marca_grade_pronta_com_segmentos(monkeypatch, tmp_path):
    monkeypatch.setattr(cortes_router, "projetos_dir", lambda: tmp_path)
    graded = _graded_dir(tmp_path)
    (graded / "clip_graded.concat.txt").write_text("file 'x'\n", encoding="utf-8")
    (graded / "clip_graded.seg000.ts").write_bytes(b"\x00" * (512 * 1024))
    db = _db_mock(_corte_mock())

    resposta = await cortes_router.obter_pipeline_status("corte-1", db=db)

    assert resposta["fases"]["grade"] is True
    assert resposta["tem_etapas_concluidas"] is True


@pytest.mark.asyncio
async def test_pipeline_status_sem_artefatos_segue_sem_etapas(monkeypatch, tmp_path):
    monkeypatch.setattr(cortes_router, "projetos_dir", lambda: tmp_path)
    db = _db_mock(_corte_mock())

    resposta = await cortes_router.obter_pipeline_status("corte-1", db=db)

    assert resposta["fases"]["grade"] is False
    assert resposta["fases"]["overlays"] is False
    assert resposta["tem_etapas_concluidas"] is False

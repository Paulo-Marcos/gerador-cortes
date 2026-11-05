"""D-1044: o bruto ainda reflete os trechos do corte?

Riscar um trecho depois do bruto mudava o líquido na tela e não o vídeo, sem nada
avisar: medido no navegador na D-1019, líquido de 1:14 e vídeo de 68 s.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.infrastructure import trechos_do_bruto
from app.models import Corte, Projeto
from app.routers import export as export_router
from app.services.bruto_defasado import bruto_ficou_para_tras


def _corte(desvios=(), inicio=100.0, fim=200.0, arranjo=None):
    return SimpleNamespace(
        id="c1",
        inicio_seg=inicio,
        fim_seg=fim,
        arranjo_blocos=arranjo,
        desvios=json.dumps(
            [
                {"inicio_hms": i, "fim_hms": f, "motivo": "teste", "origem": "claude"}
                for i, f in desvios
            ]
        ),
    )


PROJETO = SimpleNamespace(duracao_segundos=600)
UM_DESVIO = [("00:02:00.000", "00:02:10.000")]  # 120 s a 130 s


def _bruto(tmp_path: Path, trechos: list[tuple[float, float]]) -> Path:
    bruto = tmp_path / "clip_raw.mkv"
    trechos_do_bruto.gravar(bruto, trechos)
    return bruto


def test_bruto_cortado_com_os_trechos_de_hoje_nao_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_trecho_tirado_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is True


def test_trecho_devolvido_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(), PROJETO, bruto) is True


def test_intervalo_mudado_depois_do_bruto_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    assert bruto_ficou_para_tras(_corte(inicio=105.0), PROJETO, bruto) is True


def test_borda_movida_com_o_mesmo_numero_de_trechos_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    desvio = [("00:02:00.000", "00:02:12.000")]
    assert bruto_ficou_para_tras(_corte(desvio), PROJETO, bruto) is True


def test_arredondamento_do_registro_nao_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 120.004), (130.004, 200.0)])
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_bruto_sem_registro_nao_da_alarme(tmp_path):
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, tmp_path / "clip_raw.mkv") is False


def test_registro_antigo_so_com_duracoes_nao_da_alarme(tmp_path):
    bruto = tmp_path / "clip_raw.mkv"
    trechos_do_bruto.arquivo_do_registro(bruto).write_text(
        json.dumps({"duracoes": [20.0, 70.0]}), encoding="utf-8"
    )
    assert bruto_ficou_para_tras(_corte(UM_DESVIO), PROJETO, bruto) is False


def test_fim_alem_da_duracao_da_live_segue_a_mesma_conta_da_geracao(tmp_path):
    # A geração limita o corte à duração real; sem o mesmo limite aqui, daria falso alarme.
    bruto = _bruto(tmp_path, [(100.0, 150.0)])
    projeto = SimpleNamespace(duracao_segundos=150)
    assert bruto_ficou_para_tras(_corte(), projeto, bruto) is False


ARRANJO_INVERTIDO = [
    {"inicio_seg": 150.0, "fim_seg": 200.0},
    {"inicio_seg": 100.0, "fim_seg": 150.0},
]


def test_bruto_gerado_com_o_arranjo_de_hoje_nao_avisa(tmp_path):
    bruto = _bruto(tmp_path, [(150.0, 200.0), (100.0, 150.0)])
    corte = _corte(arranjo=json.dumps(ARRANJO_INVERTIDO))
    assert bruto_ficou_para_tras(corte, PROJETO, bruto) is False


def test_mesmos_trechos_em_outra_ordem_avisa(tmp_path):
    # Reordenar os blocos muda o vídeo sem mudar o que sai: a ordem conta.
    bruto = _bruto(tmp_path, [(100.0, 150.0), (150.0, 200.0)])
    corte = _corte(arranjo=json.dumps(ARRANJO_INVERTIDO))
    assert bruto_ficou_para_tras(corte, PROJETO, bruto) is True


def test_desvio_ilegivel_nao_da_alarme(tmp_path):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    assert bruto_ficou_para_tras(_corte([("abc:def", "00:02:10.000")]), PROJETO, bruto) is False


# ─── A rota que a tela lê ───────────────────────


async def _status_da_rota(monkeypatch, bruto: Path, corte, projeto=PROJETO) -> dict:
    monkeypatch.setattr(export_router, "resolver_do_projeto", lambda _valor, _projeto: bruto)
    db = AsyncMock()
    db.get.side_effect = lambda modelo, _id: {Corte: corte, Projeto: projeto}[modelo]
    return await export_router.status_corte("c1", db=db)


def _corte_com_bruto(desvios=()):
    corte = _corte(desvios)
    corte.projeto_id = "p1"
    corte.arquivo_clip_path = "clip_raw.mkv"
    return corte


@pytest.mark.asyncio
async def test_rota_avisa_quando_o_bruto_ficou_para_tras(tmp_path, monkeypatch):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    bruto.write_bytes(b"video")
    resposta = await _status_da_rota(monkeypatch, bruto, _corte_com_bruto(UM_DESVIO))
    assert resposta["clip_gerado"] is True
    assert resposta["bruto_defasado"] is True


@pytest.mark.asyncio
async def test_rota_com_o_bruto_em_dia_nao_avisa(tmp_path, monkeypatch):
    bruto = _bruto(tmp_path, [(100.0, 120.0), (130.0, 200.0)])
    bruto.write_bytes(b"video")
    resposta = await _status_da_rota(monkeypatch, bruto, _corte_com_bruto(UM_DESVIO))
    assert resposta["bruto_defasado"] is False


@pytest.mark.asyncio
async def test_rota_sem_o_video_no_disco_nao_avisa_mesmo_com_registro(tmp_path, monkeypatch):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])  # só o registro; o vídeo não existe
    resposta = await _status_da_rota(monkeypatch, bruto, _corte_com_bruto(UM_DESVIO))
    assert resposta["clip_gerado"] is False
    assert resposta["bruto_defasado"] is False


@pytest.mark.asyncio
async def test_rota_com_desvio_ilegivel_responde_sem_aviso(tmp_path, monkeypatch):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    bruto.write_bytes(b"video")
    resposta = await _status_da_rota(
        monkeypatch, bruto, _corte_com_bruto([("abc:def", "00:02:10.000")])
    )
    assert resposta["clip_gerado"] is True
    assert resposta["bruto_defasado"] is False


@pytest.mark.asyncio
async def test_rota_regerando_nao_compara_com_o_arquivo_antigo(tmp_path, monkeypatch):
    bruto = _bruto(tmp_path, [(100.0, 200.0)])
    bruto.write_bytes(b"video")
    monkeypatch.setattr(
        export_router.ExportService, "get_tarefa_corte_status", lambda _id: "cortando"
    )
    resposta = await _status_da_rota(monkeypatch, bruto, _corte_com_bruto(UM_DESVIO))
    assert resposta["status"] == "cortando"
    assert resposta["bruto_defasado"] is False


@pytest.mark.asyncio
async def test_rota_de_corte_que_nao_existe_responde_sem_aviso(tmp_path, monkeypatch):
    resposta = await _status_da_rota(monkeypatch, tmp_path / "clip_raw.mkv", None)
    assert resposta["clip_gerado"] is False
    assert resposta["bruto_defasado"] is False

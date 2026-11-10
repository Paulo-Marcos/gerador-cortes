"""D-1088: riscar o corte pela porta HTTP, como o editor risca.

O corte fica no banco como `rejeitado`; a proposta guarda data e motivo, como no
apagar (D-993); a mídia pesada do corte sai como no Limpar (D-598), com a
proteção do Fire pendente (RN-15); e a telemetria conta o riscado como apagado.
Banco em memória (toda sessão do app é desviada para ele) e a raiz dos projetos
em `tmp_path`.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.routers import corte_riscado
from app.routers.errors import registrar_tratadores
from app.services import media_retention, riscar_corte
from app.services.telemetria_cortes import TelemetriaCortesService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_MB = 1024 * 1024


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        for numero, corte_id in enumerate(("c1", "c2"), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.PROPOSTO,
                    arquivo_clip_path=f"cortes/{corte_id}/clip_raw.mkv",
                )
            )
            db.add(CorteSnapshot(id=f"s-{corte_id}", corte_id=corte_id, projeto_id="p1"))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def raiz(monkeypatch, tmp_path) -> Path:
    from app.core import channel_paths

    monkeypatch.setattr(media_retention, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture
def cliente(fabrica, raiz):
    app = FastAPI()
    app.include_router(corte_riscado.router, prefix="/api/cortes")
    registrar_tratadores(app)
    return TestClient(app)


def _pasta_com_midia(raiz: Path, corte_id: str) -> Path:
    """A pasta de um corte depois do render: mídia pesada, scratch e documentação."""
    pasta = raiz / "p1" / "cortes" / corte_id
    for relativo in (
        "clip_raw.mkv",
        "graded/clip_graded.mp4",
        "overlays/chunk_0.mov",
        "upload_ready/video.mp4",
        "tmp_rerender_ab12/parcial.mp4",
        "versoes/filtro_1.mp4",
        "shorts/short_1.mp4",
    ):
        (pasta / relativo).parent.mkdir(parents=True, exist_ok=True)
        (pasta / relativo).write_bytes(b"x" * _MB)
    (pasta / "metadados.json").write_text("{}", encoding="utf-8")
    (pasta / "thumbnail.jpg").write_bytes(b"jpg")
    return pasta


async def _corte(fabrica, corte_id: str) -> Corte | None:
    async with fabrica() as db:
        return await db.get(Corte, corte_id)


async def _snapshot(fabrica, corte_id: str) -> CorteSnapshot:
    async with fabrica() as db:
        return (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == corte_id))
        ).scalar_one()


async def _mudar(fabrica, corte_id: str, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, corte_id)
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


@pytest.mark.asyncio
async def test_riscar_grava_rejeitado_e_a_linha_fica(cliente, fabrica):
    resposta = cliente.post("/api/cortes/c1/riscar", json={})

    assert resposta.status_code == 200
    assert resposta.json()["status_anterior"] == "proposto"
    corte = await _corte(fabrica, "c1")
    assert corte is not None
    assert corte.status == StatusCorte.REJEITADO
    assert (await _corte(fabrica, "c2")).status == StatusCorte.PROPOSTO


@pytest.mark.parametrize("status", [StatusCorte.APROVADO, StatusCorte.PROCESSADO])
@pytest.mark.asyncio
async def test_riscar_vale_para_aprovado_e_processado(cliente, fabrica, status):
    await _mudar(fabrica, "c1", status=status)

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.status_code == 200
    assert resposta.json()["status_anterior"] == status.value
    assert (await _corte(fabrica, "c1")).status == StatusCorte.REJEITADO


@pytest.mark.asyncio
async def test_riscar_guarda_a_data_e_o_motivo_na_proposta(cliente, fabrica):
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    snapshot = await _snapshot(fabrica, "c1")
    assert snapshot.apagado_em is not None
    assert snapshot.motivo_apagado == "repetido"
    assert (await _snapshot(fabrica, "c2")).apagado_em is None


@pytest.mark.asyncio
async def test_o_motivo_chega_depois_do_r(cliente, fabrica):
    """R risca sem motivo; o chip do aviso risca de novo, agora com o motivo."""
    cliente.post("/api/cortes/c1/riscar")
    assert (await _snapshot(fabrica, "c1")).motivo_apagado == ""

    resposta = cliente.post("/api/cortes/c1/riscar", json={"motivo": "tema_fraco"})

    assert resposta.status_code == 200
    assert (await _snapshot(fabrica, "c1")).motivo_apagado == "tema_fraco"


@pytest.mark.asyncio
async def test_corte_no_youtube_e_recusado_e_nada_muda(cliente, fabrica, raiz):
    pasta = _pasta_com_midia(raiz, "c1")
    await _mudar(fabrica, "c1", status=StatusCorte.PROCESSADO, youtube_video_id="abc123")

    resposta = cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    assert resposta.status_code == 400
    assert "Já está no YouTube" in resposta.json()["detail"]
    assert (await _corte(fabrica, "c1")).status == StatusCorte.PROCESSADO
    assert (await _snapshot(fabrica, "c1")).apagado_em is None
    assert (pasta / "clip_raw.mkv").exists()


@pytest.mark.asyncio
async def test_corte_que_nao_existe_responde_404(cliente):
    assert cliente.post("/api/cortes/nao-existe/riscar").status_code == 404


@pytest.mark.asyncio
async def test_riscar_solta_a_midia_do_corte_como_o_limpar(cliente, fabrica, raiz):
    pasta = _pasta_com_midia(raiz, "c1")
    outra = _pasta_com_midia(raiz, "c2")
    live = raiz / "p1" / "video.mkv"
    live.write_bytes(b"x" * _MB)

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.json()["liberado_mb"] > 0
    assert not [p for p in pasta.rglob("*") if p.suffix in {".mkv", ".mp4", ".mov"}]
    assert not (pasta / "tmp_rerender_ab12").exists()
    assert not (pasta / "versoes").exists()
    # Fica o que documenta o trabalho; a live e os outros cortes não são tocados.
    assert (pasta / "metadados.json").exists()
    assert (pasta / "thumbnail.jpg").exists()
    assert (outra / "clip_raw.mkv").exists()
    assert live.exists()
    assert (await _corte(fabrica, "c1")).arquivo_clip_path == ""
    assert (await _corte(fabrica, "c2")).arquivo_clip_path == "cortes/c2/clip_raw.mkv"


@pytest.mark.asyncio
async def test_fire_com_shorts_pendentes_guarda_o_que_vai_publicar(cliente, fabrica, raiz):
    """RN-15: a mesma proteção do Limpar. O bruto e os shorts ficam."""
    pasta = _pasta_com_midia(raiz, "c1")
    await _mudar(fabrica, "c1", is_fire=True)

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.json()["retido_mb"] > 0
    assert (pasta / "clip_raw.mkv").exists()
    assert (pasta / "shorts" / "short_1.mp4").exists()
    assert not (pasta / "overlays" / "chunk_0.mov").exists()
    assert (await _corte(fabrica, "c1")).arquivo_clip_path == "cortes/c1/clip_raw.mkv"


@pytest.mark.asyncio
async def test_fire_finalizado_solta_tudo(cliente, fabrica, raiz):
    pasta = _pasta_com_midia(raiz, "c1")
    await _mudar(fabrica, "c1", is_fire=True, shorts_finalizados_em=datetime.now(UTC))

    cliente.post("/api/cortes/c1/riscar")

    assert not (pasta / "clip_raw.mkv").exists()


@pytest.mark.asyncio
async def test_a_telemetria_conta_o_riscado_como_apagado(cliente, fabrica):
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    assert telemetria["apagados"]["total"] == 1
    assert telemetria["apagados"]["por_motivo"]["repetido"] == 1
    # Uma vez só: o riscado sai da conta dos cortes mantidos.
    assert [corte["corte_id"] for corte in telemetria["cortes"]] == ["c2"]
    (grupo,) = telemetria["mudancas_por_origem"]
    assert grupo["cortes"] == 1
    assert grupo["apagados"]["total"] == 1


@pytest.fixture
def geracoes(monkeypatch):
    """O bruto pedido de novo: a geração real chama o worker, aqui só se anota."""
    pedidos: list[str] = []

    async def iniciar_geracao(corte_id: str, **_):
        pedidos.append(corte_id)
        return {"message": "Geração de bruto iniciada", "corte_id": corte_id}

    monkeypatch.setattr(riscar_corte.bruto_do_corte, "iniciar_geracao", iniciar_geracao)
    return pedidos


@pytest.mark.parametrize(
    ("antes", "volta"),
    [
        (StatusCorte.APROVADO, "aprovado"),
        (StatusCorte.PROCESSADO, "aprovado"),
        (StatusCorte.PROPOSTO, "proposto"),
    ],
)
@pytest.mark.asyncio
async def test_trazer_de_volta_devolve_a_etapa_de_antes(cliente, fabrica, geracoes, antes, volta):
    await _mudar(fabrica, "c1", status=antes)
    cliente.post("/api/cortes/c1/riscar")

    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.status_code == 200
    assert resposta.json()["status"] == volta
    assert (await _corte(fabrica, "c1")).status == volta


@pytest.mark.asyncio
async def test_trazer_de_volta_sai_da_conta_de_apagados(cliente, fabrica, geracoes):
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    cliente.post("/api/cortes/c1/trazer-de-volta")

    snapshot = await _snapshot(fabrica, "c1")
    assert snapshot.apagado_em is None
    assert snapshot.motivo_apagado == ""
    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)
    assert telemetria["apagados"]["total"] == 0
    assert sorted(corte["corte_id"] for corte in telemetria["cortes"]) == ["c1", "c2"]


@pytest.mark.asyncio
async def test_trazer_de_volta_gera_o_bruto_que_o_riscar_soltou(cliente, fabrica, raiz, geracoes):
    _pasta_com_midia(raiz, "c1")
    cliente.post("/api/cortes/c1/riscar")

    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.json()["gerando_bruto"] is True
    assert geracoes == ["c1"]
    corte = await _corte(fabrica, "c1")
    assert corte.status_antes_de_riscar == ""
    assert not corte.bruto_solto_ao_riscar


@pytest.mark.asyncio
async def test_sem_bruto_solto_nao_ha_o_que_gerar(cliente, fabrica, geracoes):
    """O corte riscado sem bruto no disco não ganha uma geração de brinde."""
    cliente.post("/api/cortes/c1/riscar")

    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.json()["gerando_bruto"] is False
    assert geracoes == []


@pytest.mark.asyncio
async def test_fire_que_guardou_o_bruto_nao_o_gera_de_novo(cliente, fabrica, raiz, geracoes):
    _pasta_com_midia(raiz, "c1")
    await _mudar(fabrica, "c1", is_fire=True)
    cliente.post("/api/cortes/c1/riscar")

    assert cliente.post("/api/cortes/c1/trazer-de-volta").json()["gerando_bruto"] is False
    assert geracoes == []


@pytest.mark.asyncio
async def test_o_motivo_dado_depois_nao_apaga_a_etapa_de_antes(cliente, fabrica, geracoes):
    await _mudar(fabrica, "c1", status=StatusCorte.APROVADO)
    cliente.post("/api/cortes/c1/riscar")
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    assert cliente.post("/api/cortes/c1/trazer-de-volta").json()["status"] == "aprovado"


@pytest.mark.asyncio
async def test_bruto_recusado_agora_nao_desfaz_a_volta(cliente, fabrica, raiz, monkeypatch):
    from app.domain.compartilhado.erros import PedidoInvalido

    async def recusar(corte_id: str, **_):
        raise PedidoInvalido("As cenas estão sendo geradas.")

    monkeypatch.setattr(riscar_corte.bruto_do_corte, "iniciar_geracao", recusar)
    _pasta_com_midia(raiz, "c1")
    cliente.post("/api/cortes/c1/riscar")

    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.status_code == 200
    assert resposta.json() == {"corte_id": "c1", "status": "proposto", "gerando_bruto": False}


@pytest.mark.asyncio
async def test_trazer_de_volta_corte_que_nao_esta_riscado_e_recusado(cliente, fabrica, geracoes):
    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.status_code == 400
    assert (await _corte(fabrica, "c1")).status == StatusCorte.PROPOSTO
    assert geracoes == []

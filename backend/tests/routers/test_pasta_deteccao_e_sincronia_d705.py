"""Abrir a pasta, detectar segmentos e sincronizar o pós, pela porta HTTP (D-705).

Teste de caracterização, antes de os três casos de uso saírem do router de
cortes. Abrir a pasta cria e abre a pasta do corte no explorador; detectar
segmentos dispara a detecção sobre o bruto, com as pré-condições dela;
sincronizar o pós promove o vídeo filtrado a entrega final quando não há cenas,
finaliza o pacote e limpa a pasta. Troca só as bordas: banco em memória, a
pasta dos projetos, o explorador, a detecção e o metadados.txt. As referências
que o movimento troca ficam no topo.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from app.services import deteccao_segmentos
from app.services.export import ExportService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Onde cada caso de uso lê a pasta dos projetos (o canal resolve o caminho gravado).
_PROJETOS_DIR_LIDO_EM = [
    "app.services.corte",
    "app.services.finalizacao_do_corte",
    "app.core.channel_paths",
]
# Onde o disparo da detecção é agendado.
_DETECCAO_AGENDADA_EM = "app.services.deteccao_segmentos"


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
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _pasta(tmp_path):
    return tmp_path / "p1" / "cortes" / "c1"


# ─── Abrir a pasta ───────────────────────────────────────────────────────────


def _explorador(monkeypatch, abrir) -> None:
    """O explorador do sistema, trocado nos dois caminhos: o Windows abre por
    `os.startfile`; Linux e Mac, por `subprocess.run` (o CI roda em Linux)."""
    monkeypatch.setattr(os, "startfile", abrir, raising=False)
    monkeypatch.setattr(subprocess, "run", lambda argumentos, **_kw: abrir(argumentos[-1]))


def test_abrir_pasta_cria_e_abre_a_pasta_do_corte(cliente, monkeypatch, tmp_path):
    abertas: list[str] = []
    _explorador(monkeypatch, abertas.append)

    corpo = cliente.post("/api/cortes/c1/abrir-pasta").json()

    esperado = str(_pasta(tmp_path).absolute())
    assert corpo == {"status": "ok", "dir_path": esperado}
    assert abertas == [esperado]
    assert _pasta(tmp_path).is_dir()


def test_abrir_pasta_que_o_sistema_recusa_da_500(cliente, monkeypatch):
    def recusa(_caminho):
        raise OSError("sem explorador")

    _explorador(monkeypatch, recusa)

    resposta = cliente.post("/api/cortes/c1/abrir-pasta")

    assert resposta.status_code == 500
    assert "sem explorador" in resposta.json()["detail"]


def test_abrir_pasta_de_corte_inexistente_da_404(cliente):
    assert cliente.post("/api/cortes/nao-tem/abrir-pasta").status_code == 404


# ─── Detectar segmentos ──────────────────────────────────────────────────────


@pytest.fixture
def deteccoes(monkeypatch):
    disparadas: list[tuple] = []

    def disparar(corte_id, video):
        disparadas.append((corte_id, video.name))

        async def nada():
            return None

        return nada()

    monkeypatch.setattr(f"{_DETECCAO_AGENDADA_EM}.executar_deteccao_segmentos", disparar)
    return disparadas


async def _gravar_bruto(fabrica, caminho: str):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).arquivo_clip_path = caminho
        await db.commit()


@pytest.mark.asyncio
async def test_detectar_dispara_sobre_o_bruto_gravado(cliente, fabrica, deteccoes, tmp_path):
    _pasta(tmp_path).mkdir(parents=True)
    (_pasta(tmp_path) / "clip_raw.mkv").write_bytes(b"mkv")
    await _gravar_bruto(fabrica, "cortes/c1/clip_raw.mkv")

    corpo = cliente.post("/api/cortes/c1/detectar-segmentos").json()

    assert corpo == {"status": "iniciado", "corte_id": "c1"}
    assert deteccoes == [("c1", "clip_raw.mkv")]


def test_detectar_em_andamento_nao_dispara_outra(cliente, deteccoes, monkeypatch):
    monkeypatch.setattr(deteccao_segmentos, "_deteccoes_em_andamento", {"c1"})

    corpo = cliente.post("/api/cortes/c1/detectar-segmentos").json()

    assert corpo == {"status": "em_andamento", "corte_id": "c1"}
    assert deteccoes == []


def test_detectar_sem_bruto_gravado_da_400(cliente, deteccoes):
    resposta = cliente.post("/api/cortes/c1/detectar-segmentos")

    assert resposta.status_code == 400
    assert "gere o bruto" in resposta.json()["detail"]
    assert deteccoes == []


@pytest.mark.asyncio
async def test_detectar_com_bruto_sumido_do_disco_da_404(cliente, fabrica, deteccoes):
    await _gravar_bruto(fabrica, "cortes/c1/clip_raw.mkv")

    resposta = cliente.post("/api/cortes/c1/detectar-segmentos")

    assert (resposta.status_code, resposta.json()["detail"]) == (
        404,
        "Arquivo bruto não encontrado em disco.",
    )


def test_detectar_em_corte_inexistente_da_404(cliente, deteccoes):
    assert cliente.post("/api/cortes/nao-tem/detectar-segmentos").status_code == 404


# ─── Sincronizar o pós ───────────────────────────────────────────────────────


@pytest.fixture
def metadados(monkeypatch):
    gerados: list = []

    async def gerar(corte_id, pasta):
        gerados.append(corte_id)

    monkeypatch.setattr(ExportService, "_gerar_metadados_txt", staticmethod(gerar))
    return gerados


async def _status(fabrica):
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        return corte.status


@pytest.mark.asyncio
async def test_com_entrega_pronta_finaliza_e_limpa(cliente, fabrica, metadados, tmp_path):
    pasta = _pasta(tmp_path)
    (pasta / "upload_ready").mkdir(parents=True)
    (pasta / "upload_ready" / "video.mp4").write_bytes(b"final")
    (pasta / "clip_raw.mkv").write_bytes(b"bruto")

    corpo = cliente.post("/api/cortes/c1/sincronizar-pos-producao").json()

    assert corpo == {"status": "ok", "mensagem": "Sincronizado via upload_ready existente."}
    assert metadados == ["c1"]
    assert await _status(fabrica) == StatusCorte.PROCESSADO
    assert sorted(p.name for p in pasta.iterdir()) == ["upload_ready"]


@pytest.mark.asyncio
async def test_sem_cenas_promove_o_filtrado_finaliza_e_limpa(cliente, fabrica, metadados, tmp_path):
    pasta = _pasta(tmp_path)
    pasta.mkdir(parents=True)
    (pasta / "clip_filtered.mp4").write_bytes(b"filtrado")
    (pasta / "grade.tmp").write_bytes(b"x")

    corpo = cliente.post("/api/cortes/c1/sincronizar-pos-producao").json()

    assert corpo == {"status": "ok", "mensagem": "Promovido e sincronizado com sucesso."}
    assert (pasta / "upload_ready" / "video.mp4").read_bytes() == b"filtrado"
    assert await _status(fabrica) == StatusCorte.PROCESSADO
    assert sorted(p.name for p in pasta.iterdir()) == ["clip_filtered.mp4", "upload_ready"]


@pytest.mark.asyncio
async def test_com_cenas_e_sem_entrega_nao_faz_nada(cliente, fabrica, metadados, tmp_path):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).cenas_remotion = json.dumps({"cenas": [{"tipo": "t"}]})
        await db.commit()
    pasta = _pasta(tmp_path)
    pasta.mkdir(parents=True)
    (pasta / "clip_filtered.mp4").write_bytes(b"filtrado")

    corpo = cliente.post("/api/cortes/c1/sincronizar-pos-producao").json()

    assert corpo["status"] == "nada_a_fazer"
    assert metadados == []
    assert await _status(fabrica) == StatusCorte.APROVADO


def test_sincronizar_corte_inexistente_da_404(cliente, metadados):
    assert cliente.post("/api/cortes/nao-tem/sincronizar-pos-producao").status_code == 404

"""O render final só sai com o plano de cenas validado (RN-37, D-1072).

Até aqui só a tela podia segurar o pedido, e a D-1065 mostrou que travar o botão
não basta: o pedido chega pela porta HTTP de qualquer jeito. A recusa mora no
domínio e é aplicada pelo service antes de qualquer artefato ser tocado. O render
parcial (grade, overlays) não faz o vídeo final e segue livre.

Pela porta HTTP de verdade, com o tratador global: o que se confere é o status e a
frase que chegam à tela. O pipeline em si é trocado por um registro de chamadas.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte.render_etapas import PLANO_NAO_VALIDADO, exigir_plano_validado
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from app.services.render.remotion_render import RemotionRenderService
from app.services.render.render_progress import RenderProgressStore
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_CENAS = json.dumps({"cenas": [{"tipo": "ficha", "inicio": 1, "fim": 2}]})


@pytest.fixture(autouse=True)
def _progresso_limpo():
    for corte_id in ("c-validado", "c-pendente"):
        RenderProgressStore._progress.pop(corte_id, None)
    yield
    for corte_id in ("c-validado", "c-pendente"):
        RenderProgressStore._progress.pop(corte_id, None)


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
        for numero, (corte_id, validadas) in enumerate(
            (("c-validado", 1), ("c-pendente", 0)), start=1
        ):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.APROVADO,
                    cenas_remotion=_CENAS,
                    cenas_validadas=validadas,
                )
            )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def disparos(monkeypatch):
    """O pipeline não roda: cada disparo fica registrado com os argumentos."""
    chamadas: list[dict] = []

    def disparar(corte_id, **kwargs):
        chamadas.append({"corte_id": corte_id, **kwargs})

    monkeypatch.setattr(RemotionRenderService, "iniciar_render_background", disparar)
    return chamadas


@pytest.fixture
def cliente(fabrica):
    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _renderizar(cliente, corte_id: str, **corpo):
    return cliente.post(f"/api/cortes/{corte_id}/renderizar-pipeline", json=corpo)


# ── Botão "Renderizar final" da Pós: corpo `{start_from: "grade"}` ou o padrão ──


@pytest.mark.parametrize("corpo", [{}, {"start_from": "grade", "continuar": False}])
def test_render_final_sem_plano_validado_e_recusado_com_o_que_falta(cliente, disparos, corpo):
    resposta = _renderizar(cliente, "c-pendente", **corpo)

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == PLANO_NAO_VALIDADO
    assert "valide o plano" in resposta.json()["detail"]
    assert disparos == []


@pytest.mark.parametrize("corpo", [{}, {"start_from": "grade", "continuar": False}])
def test_render_final_com_plano_validado_dispara(cliente, disparos, corpo):
    resposta = _renderizar(cliente, "c-validado", **corpo)

    assert resposta.status_code == 200
    assert [d["corte_id"] for d in disparos] == ["c-validado"]


# ── Modal de etapas da Pós (continuar / do zero / intervalo que chega ao final) ──


@pytest.mark.parametrize(
    "corpo",
    [
        {"start_from": "auto", "continuar": True},
        {"start_from": "overlays", "continuar": True},
        {"start_from": "render_final", "continuar": True},
        {"start_from": "grade", "parar_em": "render_final"},
        {"start_from": "grade", "parar_em": "encode"},
        {"start_from": "grade", "parar_em": "compose"},
        {"start_from": "grade", "parar_em": "fase-que-nao-existe"},
    ],
)
def test_todo_pedido_que_chega_ao_video_final_e_recusado_sem_plano(cliente, disparos, corpo):
    assert _renderizar(cliente, "c-pendente", **corpo).status_code == 400
    assert _renderizar(cliente, "c-validado", **corpo).status_code == 200
    assert [d["corte_id"] for d in disparos] == ["c-validado"]


@pytest.mark.parametrize("parar_em", ["grade", "overlays"])
def test_render_parcial_segue_livre_sem_plano_validado(cliente, disparos, parar_em):
    resposta = _renderizar(cliente, "c-pendente", start_from="grade", parar_em=parar_em)

    assert resposta.status_code == 200
    assert disparos == [
        {
            "corte_id": "c-pendente",
            "filtro": None,
            "continuar": True,
            "start_from": "grade",
            "parar_em": parar_em,
        }
    ]


def test_validar_o_plano_libera_o_render_na_hora(cliente, disparos):
    assert _renderizar(cliente, "c-pendente").status_code == 400

    validacao = cliente.post("/api/cortes/c-pendente/cenas-remotion/validar", json={})
    assert validacao.status_code == 200
    assert validacao.json()["cenas_validadas"] == 1

    assert _renderizar(cliente, "c-pendente").status_code == 200
    assert [d["corte_id"] for d in disparos] == ["c-pendente"]


def test_desfazer_a_validacao_volta_a_travar(cliente, disparos):
    desfeita = cliente.post(
        "/api/cortes/c-validado/cenas-remotion/validar", json={"validado": False}
    )
    assert desfeita.status_code == 200

    assert _renderizar(cliente, "c-validado").status_code == 400
    assert disparos == []


def test_corte_inexistente_responde_404_sem_disparar(cliente, disparos):
    assert _renderizar(cliente, "nao-existe").status_code == 404
    assert disparos == []


# ── A regra, sem porta nenhuma ──


@pytest.mark.parametrize("parar_em", [None, "render_final", "encode", "compose", "xyz"])
def test_regra_recusa_o_final_sem_plano(parar_em):
    with pytest.raises(PedidoInvalido, match="plano de cenas ainda não foi validado"):
        exigir_plano_validado(parar_em, plano_validado=False)


@pytest.mark.parametrize("parar_em", [None, "render_final", "grade", "overlays"])
def test_regra_libera_com_plano_validado(parar_em):
    exigir_plano_validado(parar_em, plano_validado=True)


@pytest.mark.parametrize("parar_em", ["grade", "overlays"])
def test_regra_deixa_o_parcial_passar_sem_plano(parar_em):
    exigir_plano_validado(parar_em, plano_validado=False)


# ── Plano vazio: o que destrava é a decisão do operador, não haver cenas ──


async def _esvaziar_o_plano(fabrica, corte_id: str) -> None:
    async with fabrica() as db:
        (await db.get(Corte, corte_id)).cenas_remotion = json.dumps({"cenas": []})
        await db.commit()


@pytest.mark.asyncio
async def test_plano_vazio_sem_validar_trava_o_render(cliente, fabrica, disparos):
    await _esvaziar_o_plano(fabrica, "c-pendente")

    resposta = _renderizar(cliente, "c-pendente")

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == PLANO_NAO_VALIDADO
    assert disparos == []


@pytest.mark.asyncio
async def test_validar_o_plano_vazio_destrava_o_render(cliente, fabrica, disparos):
    await _esvaziar_o_plano(fabrica, "c-pendente")

    validacao = cliente.post("/api/cortes/c-pendente/cenas-remotion/validar", json={})
    assert validacao.status_code == 200
    assert validacao.json()["cenas_validadas"] == 1

    assert _renderizar(cliente, "c-pendente").status_code == 200
    assert [d["corte_id"] for d in disparos] == ["c-pendente"]

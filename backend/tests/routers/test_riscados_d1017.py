"""D-1017: da resposta da IA à tela: a recusa aparece, nada se perde e a rodada se desfaz.

Banco em memória (toda sessão do app é desviada para ele); a IA é trocada por uma
resposta fixa da trechos-expert.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.domain.corte.ancora_match import RECUSA_CITACAO_NAO_CONFERE
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers import riscados as rota_riscados
from app.routers.errors import registrar_tratadores
from app.services.claude_ia import ClaudeIaService
from app.services.corte import CorteService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_FALA = "um dois tres quatro cinco seis sete oito nove dez onze doze treze".split()
_TRANSCRICAO = [
    {
        "start": 10.0 + i,
        "end": 13.0 + i,
        "texto": " ".join(_FALA[i : i + 3]),
        "palavras": [
            {"texto": p, "inicio_seg": 10.0 + i + j} for j, p in enumerate(_FALA[i : i + 3])
        ],
    }
    for i in range(0, len(_FALA), 3)
]
_MANUAL = {
    "inicio_hms": "00:00:30.000",
    "fim_hms": "00:00:31.000",
    "inicio_seg": 30.0,
    "fim_seg": 31.0,
    "motivo": "marcada à mão",
    "origem": "manual",
}


def _proposta(ini: str, fim: str, inicio_texto: str, fim_texto: str) -> dict:
    return {
        "inicio_hms": ini,
        "fim_hms": fim,
        "categoria": "repeticao",
        "motivo": "repete",
        "inicio_texto": inicio_texto,
        "fim_texto": fim_texto,
    }


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
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_TRANSCRICAO)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:01:00",
                inicio_seg=0.0,
                fim_seg=60.0,
                desvios=json.dumps([_MANUAL]),
                transcricao_corte=json.dumps(_TRANSCRICAO),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def sem_resync(monkeypatch):
    async def _fake(_corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))


def _ia_responde(monkeypatch, propostas: list[dict], vistos: list | None = None) -> None:
    async def fake(_t, _meta, existentes, _mapa=None, provider="claude"):
        if vistos is not None:
            vistos.extend(existentes)
        return {"desvios": propostas}

    monkeypatch.setattr(ClaudeIaService, "gerar_desvios", staticmethod(fake))


@pytest.fixture
def cliente(fabrica):
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.include_router(rota_riscados.router, prefix="/api/cortes")
    return TestClient(app)


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


async def _duas_marcas_uma_recusada(monkeypatch):
    _ia_responde(
        monkeypatch,
        [
            _proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis"),
            _proposta("00:00:18", "00:00:20", "ninguem falou isso", "nem isso aqui"),
        ],
    )
    return await CorteService.gerar_trechos_via_claude("c1", "claude")


@pytest.mark.asyncio
async def test_citacao_falsa_entra_riscada_com_o_motivo(fabrica, sem_resync, monkeypatch):
    resultado = await _duas_marcas_uma_recusada(monkeypatch)

    corte = await _corte(fabrica)
    desvios = json.loads(corte.desvios)
    riscados = json.loads(corte.desvios_riscados)
    assert resultado["novos"] == 1
    assert resultado["recusados"] == 1
    assert [d["motivo"] for d in desvios] == ["marcada à mão", "repete"]
    assert riscados[0]["recusa"] == RECUSA_CITACAO_NAO_CONFERE
    assert riscados[0]["rodada"] == 1
    assert riscados[0]["inicio_texto"] == "ninguem falou isso"
    # A marca recusada não vai para o corte: é o que sai no render.
    assert not any(d["inicio_seg"] == 18.0 for d in desvios)


@pytest.mark.asyncio
async def test_rodada_recusada_nao_conta_duas_vezes_ao_gerar_de_novo(
    fabrica, sem_resync, monkeypatch
):
    await _duas_marcas_uma_recusada(monkeypatch)
    resultado = await _duas_marcas_uma_recusada(monkeypatch)

    corte = await _corte(fabrica)
    assert len(json.loads(corte.desvios_riscados)) == 1
    assert resultado["novos"] == 0


@pytest.mark.asyncio
async def test_desfazer_a_rodada_pela_rota_nao_toca_na_marca_a_mao(
    fabrica, sem_resync, monkeypatch, cliente
):
    await _duas_marcas_uma_recusada(monkeypatch)

    antes = cliente.get("/api/cortes/c1").json()
    assert antes["trechos_da_ultima_rodada"] == 1

    r = cliente.post("/api/cortes/c1/desfazer-rodada")

    assert r.status_code == 200
    corpo = r.json()
    assert [d["origem"] for d in corpo["desvios"]] == ["manual"]
    assert len(corpo["desvios_riscados"]) == 2
    assert corpo["trechos_da_ultima_rodada"] == 0
    assert cliente.post("/api/cortes/c1/desfazer-rodada").status_code == 400


@pytest.mark.asyncio
async def test_lixeira_risca_e_restaurar_devolve(fabrica, sem_resync, cliente):
    r = cliente.post("/api/cortes/c1/remover-desvio", json={"desvio_index": 0})
    assert r.status_code == 200
    assert r.json()["desvios"] == []
    assert r.json()["desvios_riscados"][0]["motivo"] == "marcada à mão"

    r = cliente.post("/api/cortes/c1/restaurar-desvio", json={"riscado_index": 0})
    assert r.status_code == 200
    assert r.json()["desvios"][0]["motivo"] == "marcada à mão"
    assert r.json()["desvios_riscados"] == []


@pytest.mark.asyncio
async def test_restaurar_indice_que_nao_existe_e_400(fabrica, cliente):
    r = cliente.post("/api/cortes/c1/restaurar-desvio", json={"riscado_index": 3})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_a_ia_recebe_o_que_o_operador_riscou_para_nao_propor_de_novo(
    fabrica, sem_resync, monkeypatch, cliente
):
    cliente.post("/api/cortes/c1/remover-desvio", json={"desvio_index": 0})
    vistos: list = []
    _ia_responde(monkeypatch, [], vistos)

    await CorteService.gerar_trechos_via_claude("c1", "claude")

    assert [d["motivo"] for d in vistos] == ["o operador manteve no corte: marcada à mão"]


@pytest.mark.asyncio
async def test_proposta_igual_a_uma_riscada_nao_volta(fabrica, sem_resync, monkeypatch, cliente):
    await _duas_marcas_uma_recusada(monkeypatch)
    primeira = cliente.get("/api/cortes/c1").json()["desvios"]
    indice = next(i for i, d in enumerate(primeira) if d["origem"] == "claude")
    cliente.post("/api/cortes/c1/remover-desvio", json={"desvio_index": indice})

    _ia_responde(monkeypatch, [_proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis")])
    resultado = await CorteService.gerar_trechos_via_claude("c1", "claude")

    assert resultado["novos"] == 0


@pytest.mark.asyncio
async def test_dividir_o_corte_leva_os_riscados_junto(fabrica, sem_resync, monkeypatch, cliente):
    await _duas_marcas_uma_recusada(monkeypatch)  # riscado em 18 s

    _esquerda, direita = await CorteService.dividir_corte("c1", 10.0)

    async with fabrica() as db:
        nova = await db.get(Corte, direita)
        original = await db.get(Corte, "c1")
    assert [r["inicio_seg"] for r in json.loads(nova.desvios_riscados)] == [18.0]
    assert json.loads(original.desvios_riscados) == []


@pytest.mark.asyncio
async def test_juntar_os_cortes_mantem_os_riscados_dos_dois(fabrica, sem_resync, monkeypatch):
    await _duas_marcas_uma_recusada(monkeypatch)  # riscado em 18 s, no primeiro corte
    riscada_do_segundo = {
        "inicio_hms": "00:01:10.000",
        "fim_hms": "00:01:12.000",
        "inicio_seg": 70.0,
        "fim_seg": 72.0,
        "motivo": "riscada no segundo",
    }
    async with fabrica() as db:
        db.add(
            Corte(
                id="c2",
                projeto_id="p1",
                numero=2,
                inicio_hms="00:01:00",
                fim_hms="00:02:00",
                inicio_seg=60.0,
                fim_seg=120.0,
                desvios_riscados=json.dumps([riscada_do_segundo]),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()

    await CorteService.juntar_cortes("c1", "c2")

    corte = await _corte(fabrica)
    assert [r["inicio_seg"] for r in json.loads(corte.desvios_riscados)] == [18.0, 70.0]


@pytest.mark.asyncio
async def test_desfazer_a_rodada_devolve_a_fala_a_transcricao_final(fabrica, monkeypatch, cliente):
    _ia_responde(monkeypatch, [_proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis")])
    await CorteService.gerar_trechos_via_claude("c1", "claude")
    antes = (await _corte(fabrica)).transcricao_final_texto
    assert "quatro" not in antes

    corpo = cliente.post("/api/cortes/c1/desfazer-rodada").json()

    assert "quatro" in corpo["transcricao_final_texto"]
    assert "quatro" in (await _corte(fabrica)).transcricao_final_texto


@pytest.mark.asyncio
async def test_a_lixeira_e_restaurar_tambem_ressincronizam(fabrica, monkeypatch, cliente):
    _ia_responde(monkeypatch, [_proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis")])
    await CorteService.gerar_trechos_via_claude("c1", "claude")
    desvios = cliente.get("/api/cortes/c1").json()["desvios"]
    indice = next(i for i, d in enumerate(desvios) if d["origem"] == "claude")

    riscou = cliente.post("/api/cortes/c1/remover-desvio", json={"desvio_index": indice}).json()
    assert "quatro" in riscou["transcricao_final_texto"]

    voltou = cliente.post("/api/cortes/c1/restaurar-desvio", json={"riscado_index": 0}).json()
    assert "quatro" not in voltou["transcricao_final_texto"]


@pytest.mark.asyncio
async def test_citacao_certa_fora_do_corte_nao_e_recusada(fabrica, sem_resync, monkeypatch):
    # O corte acaba em 16 s, mas a IA lê a fala além dele: a citação existe e é verdadeira.
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.fim_seg = 16.0
        corte.fim_hms = "00:00:16"
        await db.commit()
    _ia_responde(monkeypatch, [_proposta("00:00:14", "00:00:22", "cinco seis", "doze treze")])

    resultado = await CorteService.gerar_trechos_via_claude("c1", "claude")

    assert "recusados" not in resultado
    assert resultado["novos"] == 1


@pytest.mark.asyncio
async def test_marca_sem_fim_nao_derruba_a_rodada(fabrica, sem_resync, monkeypatch):
    _ia_responde(
        monkeypatch,
        [
            _proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis"),
            {"inicio_hms": "00:00:18", "categoria": "repeticao", "motivo": "sem fim"},
        ],
    )

    resultado = await CorteService.gerar_trechos_via_claude("c1", "claude")

    assert resultado["novos"] == 1


@pytest.mark.asyncio
async def test_recusada_igual_a_marca_ativa_nao_fica_nas_duas_listas(
    fabrica, sem_resync, monkeypatch
):
    _ia_responde(
        monkeypatch, [_proposta("00:00:30", "00:00:31", "ninguem falou isso", "nem isso aqui")]
    )

    await CorteService.gerar_trechos_via_claude("c1", "claude")

    assert json.loads((await _corte(fabrica)).desvios_riscados) == []


@pytest.mark.asyncio
async def test_a_rodada_nova_vence_as_herdadas_de_uma_divisao(fabrica, sem_resync, monkeypatch):
    herdada = {**_MANUAL, "origem": "claude", "rodada": 3, "borda_da_rodada": [30.0, 31.0]}
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.desvios = json.dumps([herdada])
        corte.trechos_geracoes = 0
        await db.commit()
    _ia_responde(monkeypatch, [_proposta("00:00:12", "00:00:15", "tres quatro", "cinco seis")])

    await CorteService.gerar_trechos_via_claude("c1", "claude")

    corte = await _corte(fabrica)
    marcas = {d["inicio_seg"]: d.get("rodada") for d in json.loads(corte.desvios)}
    assert marcas[30.0] == 3
    assert next(r for t, r in marcas.items() if t != 30.0) == 4
    assert corte.trechos_geracoes == 1

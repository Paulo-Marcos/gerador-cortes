"""D-997: a faixa de duração dos shorts é do canal, no settings.db, editável na tela.

Até aqui ela era fixa no `config.py` (15 a 90 s). O canal e o settings.db moram
numa pasta do teste; no invólucro do shorts-expert só o cliente do Claude é dublê.
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from app.core import channel_paths
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.short.shorts import faixa_de_duracao_valida
from app.infrastructure import claude_cli_client
from app.models import Base, Corte, Projeto
from app.routers import channels as channels_router
from app.services import shorts as shorts_store
from app.services.canal import editorial_scaffolds, editorial_skills, faixa_do_short
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PADRAO = {
    "duracao_min_seg": 15.0,
    "duracao_max_seg": 90.0,
    "padrao_min_seg": 15.0,
    "padrao_max_seg": 90.0,
}


@pytest.fixture
def canal(monkeypatch, tmp_path):
    raiz = tmp_path / "channels" / "meucanal"
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    return raiz


class TestValidacaoNoDominio:
    def test_minimo_menor_que_o_maximo_passa(self):
        assert faixa_de_duracao_valida(20, 120) == (20.0, 120.0)

    @pytest.mark.parametrize(("minimo", "maximo"), [(90, 90), (120, 60)])
    def test_minimo_igual_ou_acima_do_maximo_e_recusado(self, minimo, maximo):
        with pytest.raises(PedidoInvalido, match="menor que a máxima"):
            faixa_de_duracao_valida(minimo, maximo)

    def test_minimo_zero_e_recusado(self):
        with pytest.raises(PedidoInvalido, match="maior que zero"):
            faixa_de_duracao_valida(0, 90)


class TestFaixaDoCanal:
    def test_canal_novo_sai_com_o_padrao_de_15_a_90(self, canal):
        assert faixa_do_short.ler_faixa() == PADRAO

    def test_grava_e_le_a_faixa_do_canal(self, canal):
        faixa_do_short.gravar_faixa(20, 150)

        faixa = faixa_do_short.faixa_do_canal(quantidade_min=5, quantidade_max=8)
        assert (faixa.duracao_min_seg, faixa.duracao_max_seg) == (20.0, 150.0)
        assert faixa.duracao_humana == "20 a 150 segundos"

    def test_faixa_e_por_canal(self, canal, monkeypatch, tmp_path):
        faixa_do_short.gravar_faixa(20, 150)
        outro = tmp_path / "channels" / "outrocanal"
        monkeypatch.setattr(channel_paths, "active_channel_root", lambda: outro)

        assert faixa_do_short.ler_faixa() == PADRAO

    def test_faixa_invalida_nao_e_gravada(self, canal):
        with pytest.raises(PedidoInvalido):
            faixa_do_short.gravar_faixa(120, 60)

        assert faixa_do_short.ler_faixa() == PADRAO


class TestRota:
    @pytest.fixture
    def cliente(self, canal):
        from app.routers.errors import registrar_tratadores

        app = FastAPI()
        registrar_tratadores(app)
        app.include_router(channels_router.router, prefix="/api/channels")
        return TestClient(app)

    def test_le_e_grava_pela_rota_do_canal_ativo(self, cliente):
        assert cliente.get("/api/channels/ativo/faixa-do-short").json() == PADRAO

        resp = cliente.put(
            "/api/channels/ativo/faixa-do-short",
            json={"duracao_min_seg": 20, "duracao_max_seg": 150},
        )

        assert resp.status_code == 200
        assert resp.json()["duracao_max_seg"] == 150.0

    def test_minimo_acima_do_maximo_volta_400_com_a_mensagem(self, cliente):
        resp = cliente.put(
            "/api/channels/ativo/faixa-do-short",
            json={"duracao_min_seg": 120, "duracao_max_seg": 60},
        )

        assert resp.status_code == 400
        assert "menor que a máxima" in resp.json()["detail"]


@pytest_asyncio.fixture
async def corte_com_bruto(canal, monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(shorts_store, "AsyncSessionLocal", factory)
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key, corpo="expertise", modelo="sonnet", thinking_tokens=0, timeout=300.0, lentes=[]
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: (
            "faixa: {faixa_duracao} {quantidade_alvo} {titulo} {tema_central} "
            "{duracao_humana} {texto_transcricao}"
        ),
    )
    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="Juros",
                tema_central="Economia",
                inicio_seg=0.0,
                fim_seg=300.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:05:00.000",
                duracao_clip_seg=300.0,
                transcricao_final=json.dumps(
                    [{"start": 0.0, "texto": "abre"}, {"start": 290.0, "texto": "fecha"}]
                ),
            )
        )
        await db.commit()
    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_shorts_expert_usa_a_faixa_do_canal(corte_com_bruto, monkeypatch):
    faixa_do_short.gravar_faixa(20, 150)
    prompts = []

    async def _fake_generate_json(prompt, **kwargs):
        prompts.append(prompt)
        # 120 s: fora do antigo teto de 90 s, dentro da faixa do canal.
        return {"shorts": [{"titulo": "Longo", "inicio": "00:10", "fim": "02:10", "score": 9}]}

    monkeypatch.setattr(claude_cli_client, "generate_json", _fake_generate_json)

    resultado = await shorts_store.sugerir_shorts("c1")

    assert "faixa: 20 a 150 segundos" in prompts[0]
    assert [s["duracao_seg"] for s in resultado["shorts"]] == [120.0]

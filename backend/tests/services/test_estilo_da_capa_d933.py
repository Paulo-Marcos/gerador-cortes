"""D-933: o estilo da capa do TikTok por canal — modal, prévia e presets."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.domain.canal import palco_componentes as palco_dominio
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.corte import capa_tiktok as geometria
from app.domain.corte import estilo_da_capa as dominio
from app.services import capa_tiktok, estilo_da_capa, palco_componentes

# --------------------------------------------------------------------------- #
# Domínio
# --------------------------------------------------------------------------- #


def test_os_estilos_da_capa_sao_os_do_palco_mais_seguir_o_palco():
    """O vocabulário é repetido (um agregado não importa outro); aqui ele casa."""
    assert set(dominio.ESTILOS_DA_CAPA) == {dominio.ESTILO_DO_PALCO, *palco_dominio.ESTILOS}
    assert dominio.ESTILO_LIMPO == palco_dominio.ESTILO_LIMPO


def test_sem_nada_salvo_a_capa_segue_o_palco_com_os_tres_componentes():
    r = dominio.resolver({}, estilo_do_palco="limpo", fundo_do_palco="aurora")
    assert (r.estilo, r.fundo) == ("limpo", "aurora")
    assert r.visiveis == dominio.VISIVEIS_PADRAO
    assert r.layout == geometria.layout_padrao()


def test_estilo_fixo_vence_o_palco():
    r = dominio.resolver({"estilo": "atual"}, estilo_do_palco="limpo", fundo_do_palco="aurora")
    assert r.estilo == "atual"


def test_esconder_um_componente():
    r = dominio.resolver(
        {"visiveis": {"selo": False}}, estilo_do_palco="atual", fundo_do_palco="linho"
    )
    assert r.visiveis["selo"] is False
    assert r.visiveis["etiqueta"] is True


def test_cabecalho_e_acento_so_existem_no_limpo():
    ligados = {"visiveis": {"cabecalho": True, "acento": True}}
    no_atual = dominio.resolver(ligados, estilo_do_palco="atual", fundo_do_palco="linho")
    no_limpo = dominio.resolver(ligados, estilo_do_palco="limpo", fundo_do_palco="linho")
    assert (no_atual.visiveis["cabecalho"], no_atual.visiveis["acento"]) == (False, False)
    assert (no_limpo.visiveis["cabecalho"], no_limpo.visiveis["acento"]) == (True, True)


def test_posicao_do_canal_vence_a_dos_ajustes_por_componente():
    globais = {"etiqueta": {"y": 300}, "selo": {"y": 1500}}
    r = dominio.resolver(
        {"posicoes": {"etiqueta": {"y": 400}}},
        estilo_do_palco="atual",
        fundo_do_palco="linho",
        posicoes_globais=globais,
    )
    assert (r.layout.etiqueta.y, r.layout.selo.y) == (400, 1500)


def test_cabecalho_nasce_acima_da_pilha_e_acento_no_vao_da_etiqueta():
    layout = geometria.layout_padrao()
    assert layout.cabecalho.y + layout.cabecalho.h <= geometria.TOPO_SEGURO
    centro_do_acento = layout.acento.y + layout.acento.h / 2
    assert layout.etiqueta.y + layout.etiqueta.h < centro_do_acento < layout.frame.y


def test_layout_salvo_com_lixo_cai_no_padrao_em_vez_de_quebrar():
    assert geometria.montar_layout([1]) == geometria.layout_padrao()  # type: ignore[arg-type]
    assert geometria.montar_layout({"etiqueta": "abc"}) == geometria.layout_padrao()


def test_props_levam_o_cabecalho_so_quando_ele_aparece():
    cabecalho = {"nome": "Canal", "handle": "@c", "imagem": ""}
    escondido = dominio.resolver({}, estilo_do_palco="limpo", fundo_do_palco="linho")
    visivel = dominio.resolver(
        {"visiveis": {"cabecalho": True}}, estilo_do_palco="limpo", fundo_do_palco="linho"
    )
    assert "cabecalho" not in dominio.props_para_renderer(escondido, cabecalho)
    assert dominio.props_para_renderer(visivel, cabecalho)["cabecalho"] == cabecalho


def test_estilo_desconhecido_e_pedido_invalido():
    with pytest.raises(PedidoInvalido):
        dominio.validar({"estilo": "neon"})


# --------------------------------------------------------------------------- #
# Service: por canal
# --------------------------------------------------------------------------- #


@pytest.fixture
def canais(tmp_path: Path, monkeypatch):
    """Dois canais no mesmo settings.db; troca o ativo pelo nome."""
    banco = tmp_path / "settings.db"
    palco_componentes.gravar({"estilo": "atual"}, db_path=banco, cache_dir=tmp_path)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: banco)
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")

    def ativar(nome: str) -> None:
        monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / nome)

    ativar("canal-a")
    return ativar


def test_cada_canal_tem_o_seu_estilo(canais):
    estilo_da_capa.gravar({"estilo": "limpo", "visiveis": {"acento": True}})
    canais("canal-b")
    assert estilo_da_capa.ler_salvo() == {}
    canais("canal-a")
    assert estilo_da_capa.ler_salvo() == {"estilo": "limpo", "visiveis": {"acento": True}}


def test_gravar_vazio_volta_ao_padrao(canais):
    estilo_da_capa.gravar({"estilo": "limpo"})
    estilo_da_capa.gravar({})
    assert estilo_da_capa.ler_salvo() == {}


def test_o_estilo_do_canal_chega_a_capa_do_corte(canais, monkeypatch):
    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {})
    estilo_da_capa.gravar({"estilo": "limpo", "fundo": "chapado", "visiveis": {"selo": False}})
    r = estilo_da_capa.resolver_para_corte("p1", "c1")
    assert (r.estilo, r.fundo, r.visiveis["selo"]) == ("limpo", "chapado", False)


@pytest.mark.asyncio
async def test_gerar_manda_visibilidade_e_cabecalho_ao_rasterizador(
    canais, tmp_path: Path, monkeypatch
):
    arte = tmp_path / "arte.png"
    arte.write_bytes(b"\x89PNG fake")
    enviados: list[dict] = []

    async def contexto(_corte_id, *, exigir_video=True):
        return {
            "projeto_id": "p1",
            "corte_id": "c1",
            "thumb_dir": tmp_path,
            "selo": "@c",
            "texto_capa": "JURO",
        }

    async def rasterizar(destino: Path, props: dict) -> None:
        enviados.append(props)
        destino.write_bytes(b"png")

    async def gravar(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(capa_tiktok, "_contexto", contexto)
    monkeypatch.setattr(capa_tiktok, "_arte_existente", lambda *_: arte)
    monkeypatch.setattr(capa_tiktok, "_rasterizar", rasterizar)
    monkeypatch.setattr(capa_tiktok, "_gravar_caminho", gravar)
    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {})
    monkeypatch.setattr(
        estilo_da_capa, "_cabecalho", lambda: {"nome": "Canal", "handle": "@c", "imagem": ""}
    )
    estilo_da_capa.gravar({"estilo": "limpo", "visiveis": {"cabecalho": True, "arte": False}})

    await capa_tiktok.gerar("c1")

    props = enviados[0]
    assert props["visiveis"]["arte"] is False
    assert props["cabecalho"]["nome"] == "Canal"
    assert set(props["faixas"]) == {"etiqueta", "frame", "selo", "cabecalho", "acento"}


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #


@pytest.fixture
def cliente(canais, monkeypatch):
    from app.routers import capa_tiktok_estilo
    from app.routers.errors import registrar_tratadores
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {})
    monkeypatch.setattr(
        estilo_da_capa, "_cabecalho", lambda: {"nome": "Canal", "handle": "@c", "imagem": ""}
    )
    monkeypatch.setattr(capa_tiktok, "arte_do_corte", lambda *_: None)

    async def corte_do_banco(corte_id):
        if corte_id != "c1":
            raise NaoEncontrado("Corte nao encontrado.")
        return "p1", "c1"

    monkeypatch.setattr(estilo_da_capa, "corte_conferido", corte_do_banco)
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(capa_tiktok_estilo.router, prefix="/api/capa-tiktok")
    return TestClient(app)


def _corpo(corte_id="c1", **estilo):
    return {"corte_id": corte_id, "estilo": estilo}


def test_painel_traz_o_efetivo_e_as_regras_do_quadro(cliente):
    painel = cliente.get("/api/capa-tiktok/estilo", params={"corte_id": "c1"})
    assert painel.status_code == 200
    corpo = painel.json()
    assert corpo["salvo"] == {"estilo": None, "fundo": None, "visiveis": None, "posicoes": None}
    assert corpo["efetivo"]["estilo"] == "atual"  # o palco do canal
    assert set(corpo["efetivo"]["faixas"]) == set(dominio.COMPONENTES)
    assert corpo["componentes_do_limpo"] == ["cabecalho", "acento"]


def test_previa_mostra_o_rascunho_sem_gravar(cliente):
    previa = cliente.post(
        "/api/capa-tiktok/estilo/previa",
        json=_corpo(estilo="limpo", posicoes={"etiqueta": {"y": 400}}),
    )
    assert previa.status_code == 200
    assert previa.json()["efetivo"]["estilo"] == "limpo"
    assert previa.json()["efetivo"]["faixas"]["etiqueta"]["y"] == 400
    assert estilo_da_capa.ler_salvo() == {}


def test_previa_nao_repete_a_arte(cliente, monkeypatch, tmp_path: Path):
    """A prévia roda a cada gesto; a arte (megabytes) só vem no GET."""
    arte = tmp_path / "arte.png"
    arte.write_bytes(b"png fake")
    monkeypatch.setattr(capa_tiktok, "arte_do_corte", lambda *_: arte)
    painel = cliente.get("/api/capa-tiktok/estilo", params={"corte_id": "c1"}).json()
    previa = cliente.post("/api/capa-tiktok/estilo/previa", json=_corpo(estilo="limpo")).json()
    assert painel["arte"].startswith("data:image/png;base64,")
    assert previa["arte"] == ""


def test_gravar_pelo_modal_vale_para_o_canal(cliente):
    gravado = cliente.put("/api/capa-tiktok/estilo", json=_corpo(estilo="limpo", fundo="linho"))
    assert gravado.status_code == 200
    assert gravado.json()["efetivo"]["fundo"] == "linho"
    assert estilo_da_capa.ler_salvo() == {"estilo": "limpo", "fundo": "linho"}


def test_estilo_desconhecido_e_recusado(cliente):
    resposta = cliente.put("/api/capa-tiktok/estilo", json=_corpo(estilo="neon"))
    assert resposta.status_code == 400
    assert estilo_da_capa.ler_salvo() == {}


def test_corte_que_nao_existe_e_404_e_nada_e_gravado(cliente):
    assert cliente.get("/api/capa-tiktok/estilo", params={"corte_id": "x"}).status_code == 404
    gravado = cliente.put("/api/capa-tiktok/estilo", json=_corpo("x", estilo="limpo"))
    assert gravado.status_code == 404
    assert estilo_da_capa.ler_salvo() == {}


def test_a_arte_e_buscada_com_o_projeto_do_banco(cliente, monkeypatch):
    """O caminho da arte nunca sai de um id da requisição (path injection)."""
    pedidos = []
    monkeypatch.setattr(capa_tiktok, "arte_do_corte", lambda *ids: pedidos.append(ids))
    cliente.get("/api/capa-tiktok/estilo", params={"corte_id": "c1", "projeto_id": "../../x"})
    assert pedidos == [("p1", "c1")]


@pytest.mark.asyncio
async def test_corte_conferido_devolve_o_que_o_banco_tem(monkeypatch):
    from app.models import Base, Corte, Projeto
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(estilo_da_capa, "AsyncSessionLocal", fabrica)
    async with fabrica() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="t",
                tema_central="e",
                resumo="r",
                inicio_seg=0.0,
                fim_seg=60.0,
                transcricao_final="[]",
            )
        )
        await db.commit()

    assert await estilo_da_capa.corte_conferido("c1") == ("proj-1", "c1")
    with pytest.raises(NaoEncontrado):
        await estilo_da_capa.corte_conferido("../c1")


def test_preset_de_capa_guarda_o_estilo_normalizado():
    from app.routers.presets import _normalizar_payload

    payload = _normalizar_payload(
        "capa_tiktok",
        {"estilo": "limpo", "fundo": "inexistente", "visiveis": {"acento": True}, "x": 1},
    )
    assert payload == {"estilo": "limpo", "visiveis": {"acento": True}}


@pytest.mark.integration  # sobe o Remotion de verdade (D-751)
@pytest.mark.asyncio
async def test_renderer_esconde_componentes_e_desenha_o_cabecalho(tmp_path: Path):
    """Esconder muda o PNG; sem `visiveis`, sai a capa de antes (byte a byte)."""
    if not (capa_tiktok._REPO_ROOT / "video-renderer" / "node_modules").exists():
        pytest.skip("renderer sem node_modules")
    faixas = geometria.layout_padrao().como_dict()
    base = {"fundo": "hud-forte", "etiqueta": "JURO", "selo": "@c", "frameDataUri": ""}
    casos = {
        "antes": {"estilo": "limpo"},
        "todos": {"estilo": "limpo", "visiveis": dict(dominio.VISIVEIS_PADRAO)},
        "sem_selo": {"estilo": "limpo", "visiveis": {**dominio.VISIVEIS_PADRAO, "selo": False}},
        "cabecalho": {
            "estilo": "limpo",
            "visiveis": {**dominio.VISIVEIS_PADRAO, "cabecalho": True, "acento": True},
            "cabecalho": {"nome": "Canal", "handle": "@c", "imagem": ""},
        },
    }
    capas = {}
    for nome, extra in casos.items():
        destino = tmp_path / f"{nome}.png"
        await capa_tiktok._rasterizar(destino, {**base, "faixas": faixas, **extra})
        capas[nome] = destino.read_bytes()

    assert capas["antes"] == capas["todos"]
    assert capas["sem_selo"] != capas["todos"]
    assert capas["cabecalho"] != capas["todos"]

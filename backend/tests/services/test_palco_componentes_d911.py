"""D-911: onde os componentes do palco são guardados e como chegam ao render."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.domain.canal import palco_componentes as dominio
from app.services import palco_componentes as svc


@pytest.fixture
def db(tmp_path: Path) -> Path:
    return tmp_path / "settings.db"


@pytest.fixture
def cache(tmp_path: Path) -> Path:
    pasta = tmp_path / "_palco_cache"
    pasta.mkdir()
    (pasta / "abc123.png").write_bytes(b"png")
    (pasta / "short-def456.png").write_bytes(b"png")
    return pasta


@pytest.fixture
def assets(tmp_path: Path) -> Path:
    return tmp_path / "canal" / "assets" / "palco"


@pytest.fixture
def renderer_public(tmp_path: Path) -> Path:
    return tmp_path / "renderer" / "public"


def test_sem_banco_le_o_padrao(db: Path):
    assert svc.ler(db_path=db, channel_id="c1") == dominio.PADRAO


def test_gravar_persiste_e_apaga_o_cache_do_palco(db: Path, cache: Path):
    novo = svc.gravar(
        {"estilo": "limpo", "cabecalho": {"nome": "Pedro"}},
        db_path=db,
        channel_id="c1",
        cache_dir=cache,
    )
    assert novo.estilo == "limpo"
    assert svc.ler(db_path=db, channel_id="c1") == novo
    # O PNG do horizontal não conhece os componentes na chave: a edição apaga tudo.
    assert list(cache.glob("*.png")) == []


def test_gravar_e_parcial_sobre_o_que_ja_estava(db: Path, tmp_path: Path):
    svc.gravar({"estilo": "limpo"}, db_path=db, channel_id="c1", cache_dir=tmp_path)
    novo = svc.gravar({"placa": {"ativo": False}}, db_path=db, channel_id="c1", cache_dir=tmp_path)
    assert novo.estilo == "limpo"
    assert novo.placa.ativo is False


def test_salvar_imagem_guarda_espelha_e_aponta_o_cabecalho(
    db: Path, assets: Path, renderer_public: Path, tmp_path: Path
):
    novo = svc.salvar_imagem(
        b"PNG",
        "image/png",
        db_path=db,
        channel_id="c1",
        assets_dir=assets,
        renderer_public=renderer_public,
        cache_dir=tmp_path,
    )
    assert novo.cabecalho.imagem == "cabecalho.png"
    assert (assets / "cabecalho.png").read_bytes() == b"PNG"
    assert (renderer_public / "palco" / "cabecalho.png").read_bytes() == b"PNG"
    assert svc.imagem_servida_relativa(novo, assets_dir=assets) == "palco/cabecalho.png"


def test_salvar_imagem_com_outra_extensao_substitui_a_antiga(
    db: Path, assets: Path, renderer_public: Path, tmp_path: Path
):
    comum = dict(db_path=db, channel_id="c1", assets_dir=assets, renderer_public=renderer_public)
    svc.salvar_imagem(b"PNG", "image/png", cache_dir=tmp_path, **comum)
    novo = svc.salvar_imagem(b"JPG", "image/jpeg", cache_dir=tmp_path, **comum)
    assert novo.cabecalho.imagem == "cabecalho.jpg"
    assert sorted(p.name for p in assets.iterdir()) == ["cabecalho.jpg"]


def test_remover_imagem_volta_ao_mascote(
    db: Path, assets: Path, renderer_public: Path, tmp_path: Path
):
    comum = dict(db_path=db, channel_id="c1", assets_dir=assets, renderer_public=renderer_public)
    svc.salvar_imagem(b"PNG", "image/png", cache_dir=tmp_path, **comum)
    novo = svc.remover_imagem(cache_dir=tmp_path, **comum)
    assert novo.cabecalho.imagem == ""
    assert not (assets / "cabecalho.png").exists()
    assert not (renderer_public / "palco" / "cabecalho.png").exists()


def test_imagem_padrao_e_a_pose_apresentador_ou_a_primeira(tmp_path: Path):
    mascote = tmp_path / "mascote"
    mascote.mkdir()
    (mascote / "zebra.png").write_bytes(b"z")
    assert svc.imagem_padrao(mascote) == mascote / "zebra.png"
    (mascote / "apresentador.png").write_bytes(b"a")
    assert svc.imagem_padrao(mascote) == mascote / "apresentador.png"
    assert svc.imagem_servida_relativa(
        dominio.PADRAO, assets_dir=tmp_path, mascote_dir=mascote
    ) == ("mascote/apresentador.png")


def test_imagem_apontada_mas_sumida_cai_no_mascote(tmp_path: Path):
    componentes = dominio.mesclar(dominio.PADRAO, {"cabecalho": {"imagem": "cabecalho.png"}})
    mascote = tmp_path / "mascote"
    mascote.mkdir()
    (mascote / "apresentador.png").write_bytes(b"a")
    assert svc.imagem_para_servir(
        componentes, assets_dir=tmp_path / "nada", mascote_dir=mascote
    ) == (mascote / "apresentador.png")


def test_props_para_palco_resolve_identidade_e_imagem(db: Path, monkeypatch, tmp_path: Path):
    svc.gravar({"estilo": "limpo"}, db_path=db, channel_id="c1", cache_dir=tmp_path)
    monkeypatch.setattr(svc, "_identidade_do_canal", lambda: ("Pedro Ivo", "pedroivosa"))
    monkeypatch.setattr(svc, "imagem_servida_relativa", lambda _c, **_k: "mascote/apresentador.png")
    props = svc.props_para_palco(db_path=db, channel_id="c1")
    assert props["estilo"] == "limpo"
    assert props["cabecalho"] == {
        "ativo": True,
        "nome": "Pedro Ivo",
        "handle": "@pedroivosa",
        "imagem": "mascote/apresentador.png",
    }


def test_props_para_palco_sem_identidade_nao_levanta(db: Path, monkeypatch):
    def quebra():
        raise RuntimeError("sem canal")

    from app.services import channels

    monkeypatch.setattr(channels, "identidade_do_canal_ativo", quebra)
    props = svc.props_para_palco(db_path=db, channel_id="c1")
    assert props["cabecalho"]["nome"] == ""
    assert props["cabecalho"]["handle"] == ""

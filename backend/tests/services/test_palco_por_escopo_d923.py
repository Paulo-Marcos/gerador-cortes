"""D-923: o palco escolhido por projeto ou corte, por tipo, e como chega ao render."""

from __future__ import annotations

import asyncio
import contextvars
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.core import channel_paths
from app.services import palco_componentes
from app.services import palco_por_escopo as svc

H, S = "horizontal", "short"


@pytest.fixture
def db(tmp_path: Path, monkeypatch) -> Path:
    banco = tmp_path / "settings.db"
    palco_componentes.gravar({"estilo": "atual"}, db_path=banco, cache_dir=tmp_path)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: banco)
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")
    return banco


def test_sem_escolha_vale_o_canal(db: Path):
    resolvido = svc.resolver("p1", "c1", H)
    assert (resolvido["efetivo"].estilo, resolvido["origem"]) == ("atual", "canal")


def test_corte_vence_projeto_que_vence_canal(db: Path):
    svc.gravar_escolha("projeto", "p1", H, {"estilo": "limpo", "fundo": "linho"})
    assert svc.resolver("p1", "c1", H)["origem"] == "projeto"
    svc.gravar_escolha("corte", "c1", H, {"estilo": "atual"}, projeto_id="p1")
    resolvido = svc.resolver("p1", "c1", H)
    assert (resolvido["efetivo"].estilo, resolvido["origem"]) == ("atual", "corte")
    assert svc.resolver("p1", "c2", H)["efetivo"].estilo == "limpo"


def test_grava_so_o_que_difere_do_nivel_de_cima(db: Path):
    escolha = svc.gravar_escolha(
        "corte", "c1", H, {"estilo": "atual", "placa": {"ativo": False, "escala": 1.0}}
    )
    assert escolha == {"placa": {"ativo": False}}


def test_cada_tipo_tem_a_sua_escolha(db: Path):
    svc.gravar_escolha("corte", "c1", H, {"cabecalho": {"mostrar_nome": False}})
    svc.gravar_escolha("corte", "c1", S, {"contorno_short": 0})
    horizontal = svc.resolver("p1", "c1", H)["efetivo"]
    short = svc.resolver("p1", "c1", S)["efetivo"]
    assert (horizontal.cabecalho.mostrar_nome, horizontal.contorno_short) == (False, 32)
    assert (short.cabecalho.mostrar_nome, short.contorno_short) == (True, 0)


def test_none_volta_a_herdar_e_o_canal_nao_muda(db: Path):
    svc.gravar_escolha("corte", "c1", H, {"estilo": "limpo"})
    assert palco_componentes.ler_do_canal().estilo == "atual"
    svc.gravar_escolha("corte", "c1", H, None)
    assert svc.resolver("p1", "c1", H)["origem"] == "canal"


def test_no_render_os_componentes_e_o_cache_seguem_o_corte(db: Path, tmp_path: Path):
    svc.gravar_escolha("corte", "c1", H, {"estilo": "limpo"})

    def renderizar(corte_id: str):
        svc.fixar_para_render("p1", corte_id, H)
        return palco_componentes.ler().estilo, channel_paths.palco_cache_dir_do_render()

    estilo, pasta = contextvars.copy_context().run(renderizar, "c1")
    assert estilo == "limpo"
    assert pasta.parent == tmp_path / "_palco_cache" and pasta.name.startswith("escopo-")
    contexto = contextvars.copy_context()
    contexto.run(renderizar, "c1")
    assert contexto.run(renderizar, "c2") == ("atual", tmp_path / "_palco_cache")
    assert channel_paths.palco_cache_dir_do_render() == tmp_path / "_palco_cache"


def test_o_render_do_corte_e_do_short_fixam_o_palco_do_tipo(db: Path, monkeypatch):
    from app.services import palco_shorts
    from app.services.render.pipeline_render_config import ProjetoRenderConfig

    svc.gravar_escolha("projeto", "p1", H, {"estilo": "limpo"})
    svc.gravar_escolha("projeto", "p1", S, {"fundo_short": "eco"})
    corte = SimpleNamespace(id="c1", projeto_id="p1")

    def horizontal():
        ProjetoRenderConfig.preparar(SimpleNamespace(id="p1"), corte)
        return palco_componentes.ler().estilo

    assert contextvars.copy_context().run(horizontal) == "limpo"

    async def plano(short_id):
        return palco_componentes.ler()

    monkeypatch.setattr(palco_shorts, "resolver_para_render", plano)
    no_short = contextvars.copy_context().run(asyncio.run, svc.resolver_palco_do_short("s1", corte))
    assert (no_short.estilo, no_short.fundo_short) == ("atual", "eco")


def test_gravar_o_canal_apaga_tambem_o_cache_de_cada_escolha(tmp_path: Path):
    cache = tmp_path / "_palco_cache"
    (cache / "escopo-abc").mkdir(parents=True)
    (cache / "escopo-abc" / "abc.png").write_bytes(b"png")
    (cache / "def.png").write_bytes(b"png")
    assert palco_componentes.invalidar_cache_do_palco(cache) == 2

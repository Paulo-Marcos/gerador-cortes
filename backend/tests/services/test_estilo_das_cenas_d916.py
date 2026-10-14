"""D-916: o overlay recebe o estilo das cenas do palco do canal."""

from __future__ import annotations

from app.domain.canal import palco_componentes as pc
from app.services import palco_componentes
from app.services.render.pipeline_render_config import ProjetoRenderConfig


def test_overlay_leva_o_estilo_das_cenas_do_canal(monkeypatch):
    componentes = pc.mesclar(
        pc.PADRAO, {"estilo": "limpo", "cards": {"ocultos": ["enfase"], "escala": 1.3}}
    )
    monkeypatch.setattr(palco_componentes, "ler", lambda: componentes)
    monkeypatch.setattr(ProjetoRenderConfig, "_preset_efetivo", lambda self: "atual")

    props = ProjetoRenderConfig().overlay_props_extra()

    assert props["estiloCenas"]["estilo"] == "limpo"
    assert props["estiloCenas"]["ocultos"] == ["enfase"]
    assert props["estiloCenas"]["escala"] == 1.3


def test_sem_escolha_o_overlay_sai_no_estilo_de_sempre(monkeypatch):
    monkeypatch.setattr(palco_componentes, "ler", lambda: pc.PADRAO)
    monkeypatch.setattr(ProjetoRenderConfig, "_preset_efetivo", lambda self: "atual")

    estilo = ProjetoRenderConfig().overlay_props_extra()["estiloCenas"]

    assert (estilo["estilo"], estilo["ocultos"], estilo["escala"]) == ("atual", [], 1.0)

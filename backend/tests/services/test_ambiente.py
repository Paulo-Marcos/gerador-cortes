"""Checagem de pré-requisitos da máquina (D-627)."""

from pathlib import Path

from app.domain.video_encoder import VideoEncoder
from app.services import ambiente


def _sondas(**trocas) -> ambiente.Sondas:
    """Máquina completa; cada teste tira o que quer ver faltando."""
    base = {
        "achar_binario": lambda nome: f"C:/bin/{nome}.exe",
        "existe": lambda _caminho: True,
        "encoder": lambda: VideoEncoder.QSV,
        "claude_cli": lambda: "C:/bin/claude.exe",
        "agy_cli": lambda: "C:/bin/agy.exe",
        "chrome": lambda: Path("C:/chrome.exe"),
        "client_secrets": lambda: Path("C:/App/backend/client_secrets.json"),
        "tem_chave_gemini": lambda: True,
    }
    base.update(trocas)
    return ambiente.Sondas(**base)


def _por_id(checagens):
    return {c.id: c for c in checagens}


def test_maquina_completa_fica_toda_ok():
    checagens = ambiente.checar(_sondas())
    assert {c.estado for c in checagens} == {"ok"}
    assert [c.obrigatorio for c in checagens] == sorted(
        (c.obrigatorio for c in checagens), reverse=True
    ), "obrigatórios primeiro"


def test_binario_obrigatorio_faltando_e_erro_com_como_resolver():
    sondas = _sondas(achar_binario=lambda nome: None if nome == "yt-dlp" else "x")
    item = _por_id(ambiente.checar(sondas))["yt_dlp"]
    assert item.estado == "erro"
    assert "yt-dlp" in item.como_resolver


def test_renderer_sem_node_modules_e_erro():
    sondas = _sondas(existe=lambda caminho: "node_modules" not in caminho.parts)
    assert _por_id(ambiente.checar(sondas))["renderer_deps"].estado == "erro"


def test_opcionais_faltando_sao_aviso_e_explicam_o_que_se_perde():
    sondas = _sondas(
        encoder=lambda: VideoEncoder.LIBX264,
        claude_cli=lambda: None,
        agy_cli=lambda: None,
        chrome=lambda: None,
        tem_chave_gemini=lambda: False,
        existe=lambda caminho: caminho.name != "client_secrets.json",
    )
    itens = _por_id(ambiente.checar(sondas))
    for id_ in ("encoder", "claude_cli", "agy_cli", "chrome", "gemini_key", "youtube_client"):
        assert itens[id_].estado == "aviso", id_
    assert "modo manual" in itens["claude_cli"].como_resolver
    assert "Canais" in itens["youtube_client"].como_resolver


def test_chave_gemini_nunca_expoe_o_valor(monkeypatch):
    monkeypatch.setattr(ambiente.settings, "gemini_api_key", "segredo-que-nao-pode-vazar")
    item = _por_id(
        ambiente.checar(_sondas(tem_chave_gemini=ambiente.sondas_da_maquina().tem_chave_gemini))
    )["gemini_key"]
    assert item.ok
    assert "segredo" not in f"{item.detalhe}{item.como_resolver}"

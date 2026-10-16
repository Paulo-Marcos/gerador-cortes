"""D-940: quando o YouTube oferece a legenda em mais de um idioma, vale o português.

O yt-dlp baixa todos os idiomas pedidos (`pt,pt-BR,pt-PT,en`) e a ingestão
pegava o primeiro arquivo do glob — `sub.en.json3` vem antes de `sub.pt.json3`
em ordem alfabética, e a transcrição da live (e a legenda dos shorts) saía em
inglês.
"""

import asyncio
import json
from pathlib import Path

import pytest
from app.domain.projeto.idioma_da_legenda import escolher_legenda
from app.services import ingestao as ingestao_module
from app.services.ingestao import IngestaoService


def _json3(*palavras: str) -> str:
    segs = [{"utf8": f"{p} "} for p in palavras]
    return json.dumps({"events": [{"tStartMs": 0, "dDurationMs": 2000, "segs": segs}]})


class _ProcessoFake:
    returncode = 0

    async def communicate(self):
        return b"", b""


@pytest.fixture
def legendas_em_dois_idiomas(monkeypatch, tmp_path):
    """Simula o que o yt-dlp deixa na pasta: inglês e português lado a lado."""
    subs = tmp_path / "proj-1" / "subtitles"
    subs.mkdir(parents=True)
    (subs / "sub.en.json3").write_text(_json3("you", "ask"), encoding="utf-8")
    (subs / "sub.pt.json3").write_text(_json3("você", "pergunta"), encoding="utf-8")

    async def _sem_saida(*_args, **_kwargs):
        return _ProcessoFake()

    monkeypatch.setattr(ingestao_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _sem_saida)


class TestExtrairLegenda:
    @pytest.mark.asyncio
    async def test_com_ingles_e_portugues_a_transcricao_sai_em_portugues(
        self, legendas_em_dois_idiomas
    ):
        trans = await IngestaoService._extrair_legenda("proj-1", "https://youtu.be/abc12345678")

        texto = " ".join(seg["texto"] for seg in trans)
        assert "você" in texto
        assert "you" not in texto


class TestEscolherLegenda:
    def test_portugues_vence_ingles(self):
        arquivos = [Path("sub.en.json3"), Path("sub.pt.json3")]
        assert escolher_legenda(arquivos) == Path("sub.pt.json3")

    def test_pt_vence_variantes_regionais(self):
        arquivos = [Path("sub.pt-PT.vtt"), Path("sub.pt-BR.vtt"), Path("sub.pt.vtt")]
        assert escolher_legenda(arquivos) == Path("sub.pt.vtt")

    def test_pt_br_vence_pt_pt(self):
        arquivos = [Path("sub.pt-PT.vtt"), Path("sub.pt-BR.vtt")]
        assert escolher_legenda(arquivos) == Path("sub.pt-BR.vtt")

    def test_so_ingles_ainda_serve(self):
        assert escolher_legenda([Path("sub.en.json3")]) == Path("sub.en.json3")

    def test_idioma_fora_da_lista_fica_por_ultimo(self):
        arquivos = [Path("sub.es.json3"), Path("sub.en.json3")]
        assert escolher_legenda(arquivos) == Path("sub.en.json3")

    def test_sem_arquivo_devolve_none(self):
        assert escolher_legenda([]) is None

"""Testes da lógica pura de segmentos detectados (F-054).

Não exercem PySceneDetect direto — esses testes cobrem a parte determinística:
transição de status conforme decisão e materialização de regiões em
`layout_youtube`. A detecção de vídeo em si depende de ffmpeg/opencv e fica
fora do escopo unitário (validada manualmente).
"""

from __future__ import annotations

import json

import pytest
from app.services import deteccao_segmentos as ds
from app.services.deteccao_segmentos import (
    StatusSegmentoDetectado,
    aplicar_decisao_segmento,
    deteccao_em_andamento,
    executar_deteccao_segmentos,
    materializar_regiao_em_layout,
)


def _seg(inicio: float, fim: float) -> dict:
    return {
        "inicio": inicio,
        "fim": fim,
        "score": 0.5,
        "status": StatusSegmentoDetectado.SUGERIDO.value,
    }


class TestAplicarDecisaoSegmento:
    def test_aceitar_full_marca_status_correto(self):
        segs = [_seg(0.0, 10.0), _seg(10.0, 20.0)]

        novos, alvo = aplicar_decisao_segmento(segs, 0, "full")

        assert novos[0]["status"] == StatusSegmentoDetectado.ACEITO_FULL.value
        assert alvo["status"] == StatusSegmentoDetectado.ACEITO_FULL.value
        # Outros não devem mudar
        assert novos[1]["status"] == StatusSegmentoDetectado.SUGERIDO.value

    def test_aceitar_compartilhada_marca_status_correto(self):
        segs = [_seg(0.0, 10.0)]

        novos, _ = aplicar_decisao_segmento(segs, 0, "compartilhada")

        assert novos[0]["status"] == StatusSegmentoDetectado.ACEITO_COMPARTILHADA.value

    def test_rejeitar_marca_status_correto(self):
        segs = [_seg(0.0, 10.0)]

        novos, _ = aplicar_decisao_segmento(segs, 0, "rejeitar")

        assert novos[0]["status"] == StatusSegmentoDetectado.REJEITADO.value

    def test_nao_muta_lista_original(self):
        segs = [_seg(0.0, 10.0)]

        aplicar_decisao_segmento(segs, 0, "full")

        # Original intocado
        assert segs[0]["status"] == StatusSegmentoDetectado.SUGERIDO.value

    def test_indice_invalido_levanta_index_error(self):
        segs = [_seg(0.0, 10.0)]

        with pytest.raises(IndexError):
            aplicar_decisao_segmento(segs, 5, "full")

    def test_decisao_invalida_levanta_value_error(self):
        segs = [_seg(0.0, 10.0)]

        with pytest.raises(ValueError):
            aplicar_decisao_segmento(segs, 0, "maybe")


class TestMaterializarRegiaoEmLayout:
    def test_aceitar_full_adiciona_regiao_modo_full(self):
        layout = {"modo_padrao": "full", "regioes": []}
        seg = _seg(5.0, 12.5)

        novo = materializar_regiao_em_layout(layout, seg, "full")

        assert len(novo["regioes"]) == 1
        regiao = novo["regioes"][0]
        assert regiao["modo"] == "full"
        assert regiao["inicio"] == 5.0
        assert regiao["fim"] == 12.5

    def test_aceitar_compartilhada_adiciona_regiao_modo_compartilhada(self):
        layout = {"modo_padrao": "full", "regioes": []}
        seg = _seg(0.0, 8.0)

        novo = materializar_regiao_em_layout(layout, seg, "compartilhada")

        assert novo["regioes"][0]["modo"] == "compartilhada"

    def test_rejeitar_nao_altera_regioes(self):
        layout = {"modo_padrao": "full", "regioes": [{"inicio": 0, "fim": 1, "modo": "full"}]}

        novo = materializar_regiao_em_layout(layout, _seg(5.0, 10.0), "rejeitar")

        assert novo["regioes"] == [{"inicio": 0, "fim": 1, "modo": "full"}]

    def test_preserva_regioes_existentes_e_ordena_por_inicio(self):
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 30.0, "fim": 40.0, "modo": "full"},
                {"inicio": 0.0, "fim": 5.0, "modo": "compartilhada"},
            ],
        }
        seg = _seg(10.0, 20.0)

        novo = materializar_regiao_em_layout(layout, seg, "full")

        inicios = [r["inicio"] for r in novo["regioes"]]
        assert inicios == sorted(inicios)
        assert len(novo["regioes"]) == 3

    def test_segmento_degenerado_nao_polui_layout(self):
        """fim <= inicio: não cria região inválida."""
        layout = {"modo_padrao": "full", "regioes": []}
        seg = {"inicio": 5.0, "fim": 5.0, "score": 0.5, "status": "sugerido"}

        novo = materializar_regiao_em_layout(layout, seg, "full")

        assert novo["regioes"] == []

    def test_nao_muta_layout_original(self):
        layout = {"modo_padrao": "full", "regioes": []}
        materializar_regiao_em_layout(layout, _seg(0.0, 10.0), "full")

        assert layout["regioes"] == []

    def test_decisao_sem_mapeamento_de_modo_levanta_value_error(self):
        layout = {"modo_padrao": "full", "regioes": []}

        with pytest.raises(ValueError):
            materializar_regiao_em_layout(layout, _seg(0.0, 10.0), "talvez")


class _CorteFake:
    """Stand-in mínimo de `Corte` — só o atributo que a orquestração escreve."""

    def __init__(self, corte_id: str) -> None:
        self.id = corte_id
        self.segmentos_detectados = None


class _SessionFake:
    """Sessão async fake: `async with`, `get` e `commit` — sem banco real."""

    def __init__(self, corte: _CorteFake | None) -> None:
        self._corte = corte
        self.commits = 0

    async def __aenter__(self) -> _SessionFake:
        return self

    async def __aexit__(self, *_exc) -> bool:
        return False

    async def get(self, _model, _corte_id):
        return self._corte

    async def commit(self) -> None:
        self.commits += 1


class TestExecutarDeteccaoSegmentos:
    """Cobre a orquestração movida do router para o serviço (D-075)."""

    @pytest.mark.asyncio
    async def test_persiste_segmentos_detectados_no_corte(self, monkeypatch, tmp_path):
        corte = _CorteFake("corte-1")
        session = _SessionFake(corte)
        segmentos = [{"inicio": 0.0, "fim": 3.0, "score": 1.0, "status": "sugerido"}]

        async def fake_detectar(_video_path):
            return segmentos

        monkeypatch.setattr(ds, "detectar_segmentos_async", fake_detectar)
        monkeypatch.setattr(ds, "AsyncSessionLocal", lambda: session)

        await executar_deteccao_segmentos("corte-1", tmp_path / "bruto.mkv")

        assert corte.segmentos_detectados == json.dumps(segmentos, ensure_ascii=False)
        assert session.commits == 1
        # Guard liberado ao final — permite re-disparo posterior.
        assert deteccao_em_andamento("corte-1") is False

    @pytest.mark.asyncio
    async def test_corte_inexistente_nao_commita(self, monkeypatch, tmp_path):
        session = _SessionFake(None)

        async def fake_detectar(_video_path):
            return []

        monkeypatch.setattr(ds, "detectar_segmentos_async", fake_detectar)
        monkeypatch.setattr(ds, "AsyncSessionLocal", lambda: session)

        await executar_deteccao_segmentos("sumido", tmp_path / "bruto.mkv")

        assert session.commits == 0
        assert deteccao_em_andamento("sumido") is False

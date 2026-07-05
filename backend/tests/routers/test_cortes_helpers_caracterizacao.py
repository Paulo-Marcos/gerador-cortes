"""Caracterização dos helpers puros do router de cortes (E-006).

Fixa `_hms_to_seg` e `_corte_to_dict` ANTES do fatiamento (extração de schemas e
helpers para sub-módulos). Prova que os nomes seguem importáveis de
`app.routers.cortes` e que o comportamento não muda.
"""

import pytest
from app.models import Corte
from app.routers import cortes as cortes_router


class TestHmsToSeg:
    @pytest.mark.parametrize(
        "hms,esperado",
        [
            ("00:00:10", 10.0),
            ("01:02:03", 3723.0),
            ("02:05", 125.0),
            ("42", 42.0),
            ("", 0.0),
            ("lixo", 0.0),
            ("00:00:10.5", 10.5),
        ],
    )
    def test_converte(self, hms, esperado):
        assert cortes_router._hms_to_seg(hms) == pytest.approx(esperado)


class TestCorteToDict:
    def _corte(self, **over):
        c = Corte()
        c.id = over.get("id", "corte-carac")
        c.projeto_id = over.get("projeto_id", "proj-inexistente-carac-xyz")
        c.desvios = over.get("desvios")
        c.transcricao_corte = over.get("transcricao_corte")
        c.cenas_remotion = over.get("cenas_remotion")
        c.layout_youtube = over.get("layout_youtube")
        c.arquivo_clip_path = over.get("arquivo_clip_path")
        # Valores realistas de um corte persistido (colunas com default no banco);
        # num objeto transiente ficariam None. Fixa a caracterização.
        c.is_pos_producao = over.get("is_pos_producao", 0)
        c.duracao_clip_seg = over.get("duracao_clip_seg", 0.0)
        return c

    def test_campos_json_viram_estruturas(self):
        c = self._corte(
            desvios='[{"inicio_hms":"00:00:01","fim_hms":"00:00:02","motivo":"x"}]',
            transcricao_corte="[]",
            cenas_remotion="[]",
            layout_youtube='{"modo_padrao":"full"}',
        )
        d = cortes_router._corte_to_dict(c)
        assert d["desvios"] == [
            {"inicio_hms": "00:00:01", "fim_hms": "00:00:02", "motivo": "x"}
        ]
        assert d["transcricao_corte"] == []
        assert d["layout_youtube"]["modo_padrao"] == "full"

    def test_campos_nulos_viram_defaults_vazios(self):
        d = cortes_router._corte_to_dict(self._corte())
        assert d["desvios"] == []
        assert d["transcricao_corte"] == []
        assert d["layout_youtube"] == {}
        assert d["segmentos_detectados"] == []
        assert d["is_fire"] is False
        # Projeto inexistente em disco -> sem upload_ready -> não é pós-produção.
        assert d["is_pos_producao"] == 0

    def test_layout_youtube_dict_direto(self):
        c = self._corte()
        c.layout_youtube = {"modo_padrao": "compartilhada"}
        d = cortes_router._corte_to_dict(c)
        assert d["layout_youtube"] == {"modo_padrao": "compartilhada"}

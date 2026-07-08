"""D-305: agregações puras dos levantamentos de desempenho (sem I/O, sem rede)."""

from __future__ import annotations

from app.domain.youtube_stats import (
    bucket_duracao,
    bucket_titulo_len,
    csv_duracao_retencao,
    csv_titulo_desempenho,
    levantamento_duracao_retencao,
    levantamento_titulo_desempenho,
    normalizar_titulo,
    parsear_duracao_iso8601,
)


class TestParsearDuracaoIso8601:
    def test_horas_minutos_segundos(self):
        assert parsear_duracao_iso8601("PT1H2M3S") == 3723.0

    def test_so_minutos(self):
        assert parsear_duracao_iso8601("PT15M") == 900.0

    def test_so_segundos(self):
        assert parsear_duracao_iso8601("PT45S") == 45.0

    def test_com_dias(self):
        assert parsear_duracao_iso8601("P1DT1H") == 90000.0

    def test_vazio_ou_invalido_vira_zero(self):
        assert parsear_duracao_iso8601("") == 0.0
        assert parsear_duracao_iso8601(None) == 0.0  # type: ignore[arg-type]
        assert parsear_duracao_iso8601("banana") == 0.0


class TestBuckets:
    def test_bucket_duracao_bordas_semiabertas(self):
        assert bucket_duracao(299) == "<5"  # 4,98 min
        assert bucket_duracao(300) == "5-8"  # exatamente 5 min entra na faixa de cima
        assert bucket_duracao(480) == "8-12"  # 8 min
        assert bucket_duracao(1080) == "18-30"  # 18 min
        assert bucket_duracao(1800) == ">30"  # 30 min
        assert bucket_duracao(5400) == ">30"

    def test_bucket_titulo_len(self):
        assert bucket_titulo_len(39) == "<40"
        assert bucket_titulo_len(40) == "40-54"
        assert bucket_titulo_len(55) == "55-60"
        assert bucket_titulo_len(60) == "55-60"
        assert bucket_titulo_len(61) == "61-70"
        assert bucket_titulo_len(999) == ">70"


class TestNormalizarTitulo:
    def test_remove_emoji_acento_pontuacao_e_caixa(self):
        assert normalizar_titulo("🔥 A Crise: por quê?") == "a crise por que"

    def test_colapsa_espacos(self):
        assert normalizar_titulo("  dois   espaços  ") == "dois espacos"

    def test_vazio(self):
        assert normalizar_titulo("") == ""
        assert normalizar_titulo(None) == ""  # type: ignore[arg-type]


def _video(**kw) -> dict:
    base = {
        "video_id": "v",
        "titulo": "titulo",
        "duracao_seg": 0.0,
        "views": 0,
        "average_view_percentage": 0.0,
        "average_view_duration_seg": 0.0,
    }
    base.update(kw)
    return base


class TestLevantamentoDuracaoRetencao:
    def test_uma_linha_por_faixa_em_ordem_canonica(self):
        linhas = levantamento_duracao_retencao([])
        faixas = [linha["faixa"] for linha in linhas]
        assert faixas == ["<5", "5-8", "8-12", "12-18", "18-30", ">30"]
        assert all(linha["videos"] == 0 for linha in linhas)

    def test_media_simples_e_ponderada_por_views(self):
        videos = [
            _video(duracao_seg=360, views=100, average_view_percentage=50.0),  # 6 min → 5-8
            _video(duracao_seg=420, views=300, average_view_percentage=30.0),  # 7 min → 5-8
        ]
        faixa = next(
            linha for linha in levantamento_duracao_retencao(videos) if linha["faixa"] == "5-8"
        )
        assert faixa["videos"] == 2
        assert faixa["views_total"] == 400
        assert faixa["views_media"] == 200.0
        assert faixa["retencao_media_pct"] == 40.0  # (50+30)/2
        # ponderada: (50*100 + 30*300) / 400 = 14000/400 = 35.0
        assert faixa["retencao_ponderada_pct"] == 35.0


class TestLevantamentoTituloDesempenho:
    def test_agrupa_por_comprimento_e_caracteristica(self):
        titulo_55 = "x" * 57  # cai em 55-60
        videos = [
            _video(titulo=titulo_55, views=100, average_view_percentage=40.0),
            _video(titulo="Sem dois pontos e sem numero", views=50, average_view_percentage=20.0),
            _video(titulo="Com dois pontos: e numero 7?", views=200, average_view_percentage=60.0),
        ]
        linhas = levantamento_titulo_desempenho(videos)

        comprimento = {linha["faixa"]: linha for linha in linhas if linha["grupo"] == "comprimento"}
        assert comprimento["55-60"]["videos"] == 1

        dois_pontos = {linha["faixa"]: linha for linha in linhas if linha["grupo"] == "dois_pontos"}
        assert dois_pontos["com"]["videos"] == 1
        assert dois_pontos["sem"]["videos"] == 2

        numero = {linha["faixa"]: linha for linha in linhas if linha["grupo"] == "numero"}
        assert numero["com"]["videos"] == 1  # só o "numero 7"

        pergunta = {linha["faixa"]: linha for linha in linhas if linha["grupo"] == "pergunta"}
        assert pergunta["com"]["videos"] == 1


class TestCsv:
    def test_csv_duracao_tem_header_e_uma_linha_por_faixa(self):
        corpo = csv_duracao_retencao(levantamento_duracao_retencao([]))
        linhas = corpo.strip().split("\n")
        assert linhas[0].startswith("faixa,videos,views_total")
        assert len(linhas) == 1 + 6  # header + 6 faixas

    def test_csv_titulo_tem_header_e_colunas_esperadas(self):
        corpo = csv_titulo_desempenho(levantamento_titulo_desempenho([]))
        assert (
            corpo.splitlines()[0]
            == "grupo,faixa,videos,views_total,views_media,retencao_media_pct,retencao_ponderada_pct"
        )

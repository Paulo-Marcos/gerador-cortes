"""D-305: parsing de respostas fake da API e checagem de escopo do token.

Nenhum teste toca a rede: os parsers recebem dicts iguais aos que a Data/Analytics
API devolvem, e a carga de credenciais é exercida com um `Credentials` falso.
"""

from __future__ import annotations

from datetime import datetime

import pytest
from app.infrastructure import youtube_analytics as ya
from googleapiclient.errors import HttpError


class _FakeResp:
    def __init__(self, status: int):
        self.status = status
        self.reason = "Forbidden"


def _http_error(status: int, content: bytes) -> HttpError:
    return HttpError(_FakeResp(status), content)


class TestUploadDeItem:
    def test_extrai_titulo_duracao_e_data(self):
        item = {
            "id": "vid1",
            "snippet": {"title": "Meu vídeo", "publishedAt": "2024-01-02T10:00:00Z"},
            "contentDetails": {"duration": "PT10M30S"},
        }
        upload = ya._upload_de_item(item)
        assert upload.video_id == "vid1"
        assert upload.titulo == "Meu vídeo"
        assert upload.duracao_seg == 630.0
        assert upload.publicado_em == datetime(2024, 1, 2, 10, 0, 0)

    def test_campos_ausentes_nao_quebram(self):
        upload = ya._upload_de_item({"id": "x"})
        assert upload.titulo == ""
        assert upload.duracao_seg == 0.0
        assert upload.publicado_em is None


class TestMetricasDeReport:
    def test_mapeia_por_columnheaders_independente_da_ordem(self):
        report = {
            "columnHeaders": [
                {"name": "video"},
                {"name": "averageViewPercentage"},
                {"name": "views"},
                {"name": "estimatedMinutesWatched"},
                {"name": "averageViewDuration"},
                {"name": "subscribersGained"},
            ],
            "rows": [
                ["vid1", 45.5, 1000, 500.0, 120, 10],
                ["vid2", 20.0, 50, 5.0, 30, 0],
            ],
        }
        metricas = ya._metricas_de_report(report)
        assert set(metricas) == {"vid1", "vid2"}
        assert metricas["vid1"].views == 1000
        assert metricas["vid1"].average_view_percentage == 45.5
        assert metricas["vid1"].average_view_duration_seg == 120.0
        assert metricas["vid1"].subscribers_gained == 10
        assert metricas["vid2"].views == 50

    def test_report_sem_dimensao_video_vira_vazio(self):
        assert ya._metricas_de_report({"columnHeaders": [{"name": "views"}], "rows": [[1]]}) == {}

    def test_report_sem_linhas(self):
        assert ya._metricas_de_report({"columnHeaders": [{"name": "video"}]}) == {}


class TestTraduzirHttpError:
    def test_api_desabilitada_gera_instrucao_de_habilitar_com_projeto(self):
        content = (
            b'{"error": {"code": 403, "errors": [{"reason": "accessNotConfigured", '
            b'"message": "YouTube Analytics API has not been used in project 747438536282 '
            b'before or it is disabled."}]}}'
        )
        erro = ya._traduzir_http_error(_http_error(403, content), contexto="consultar")
        assert isinstance(erro, ya.YoutubeAnalyticsError)
        assert erro.precisa_reautorizar is False
        assert "não está habilitada" in str(erro)
        assert "project=747438536282" in str(erro)

    def test_falha_generica_nao_vira_habilitar_api(self):
        erro = ya._traduzir_http_error(
            _http_error(500, b'{"error": "boom"}'), contexto="consultar as estatísticas"
        )
        assert isinstance(erro, ya.YoutubeAnalyticsError)
        assert erro.precisa_reautorizar is False
        assert "consultar as estatísticas" in str(erro)
        assert "habilitada" not in str(erro)

    def test_403_de_outra_causa_nao_vira_habilitar_api(self):
        erro = ya._traduzir_http_error(
            _http_error(403, b'{"error": {"reason": "quotaExceeded"}}'), contexto="consultar"
        )
        assert "habilitada" not in str(erro)


class _FakeRequest:
    def __init__(self, report: dict):
        self._report = report

    def execute(self) -> dict:
        return self._report


class _FakeReports:
    def __init__(self, chamadas: list[dict]):
        self._chamadas = chamadas

    def query(self, **kwargs) -> _FakeRequest:
        self._chamadas.append(kwargs)
        # Devolve uma linha por vídeo listado no filtro `video==id1,id2,...`.
        ids = kwargs["filters"].removeprefix("video==").split(",")
        rows = [[vid, 0, 100 + i, 0.0, 0, 0] for i, vid in enumerate(ids)]
        return _FakeRequest(
            {
                "columnHeaders": [
                    {"name": "video"},
                    {"name": "averageViewPercentage"},
                    {"name": "views"},
                    {"name": "averageViewDuration"},
                    {"name": "estimatedMinutesWatched"},
                    {"name": "subscribersGained"},
                ],
                "rows": rows,
            }
        )


class _FakeAnalytics:
    def __init__(self, chamadas: list[dict]):
        self._reports = _FakeReports(chamadas)

    def reports(self) -> _FakeReports:
        return self._reports


class TestMetricasLifetime:
    def test_consulta_em_lotes_por_filtro_de_video(self, monkeypatch):
        chamadas: list[dict] = []
        monkeypatch.setattr(ya, "build", lambda *a, **k: _FakeAnalytics(chamadas))
        video_ids = [f"v{n}" for n in range(250)]

        metricas = ya.metricas_lifetime(
            object(), video_ids=video_ids, start_date="2005-01-01", end_date="2026-07-10"
        )

        # 250 vídeos → 2 lotes (200 + 50), cobertura completa, sem paginação frágil.
        assert len(metricas) == 250
        assert len(chamadas) == 2
        assert chamadas[0]["filters"].startswith("video==")
        assert len(chamadas[0]["filters"].removeprefix("video==").split(",")) == 200
        assert len(chamadas[1]["filters"].removeprefix("video==").split(",")) == 50
        # O teto de 200 do relatório "top videos" não deve reaparecer: nada de sort/startIndex.
        assert "sort" not in chamadas[0]
        assert "startIndex" not in chamadas[0]

    def test_sem_video_ids_nao_chama_a_api(self, monkeypatch):
        chamadas: list[dict] = []
        monkeypatch.setattr(ya, "build", lambda *a, **k: _FakeAnalytics(chamadas))
        metricas = ya.metricas_lifetime(
            object(), video_ids=[], start_date="2005-01-01", end_date="2026-07-10"
        )
        assert metricas == {}
        assert chamadas == []


class TestParsearIsoUtc:
    def test_converte_para_naive_utc(self):
        assert ya._parsear_iso_utc("2024-06-01T15:30:00Z") == datetime(2024, 6, 1, 15, 30, 0)

    def test_vazio_ou_invalido(self):
        assert ya._parsear_iso_utc("") is None
        assert ya._parsear_iso_utc("nao-e-data") is None


class _FakeCreds:
    def __init__(self, *, scopes, valid=True, expired=False, refresh_token=None):
        self.scopes = scopes
        self.valid = valid
        self.expired = expired
        self.refresh_token = refresh_token


class TestCarregarCredenciais:
    def test_token_ausente_pede_reautorizacao(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ya, "youtube_token_path", lambda: tmp_path / "nao-existe.json")
        with pytest.raises(ya.YoutubeAnalyticsError) as exc:
            ya.carregar_credenciais()
        assert exc.value.precisa_reautorizar is True

    def test_token_sem_escopo_de_analytics_pede_reautorizacao(self, tmp_path, monkeypatch):
        token = tmp_path / "token.json"
        token.write_text("{}", encoding="utf-8")
        segredo = tmp_path / "client_secrets.json"
        segredo.write_text("{}", encoding="utf-8")
        monkeypatch.setattr(ya, "youtube_token_path", lambda: token)
        monkeypatch.setattr(ya, "youtube_client_secrets_path", lambda: segredo)
        so_upload = _FakeCreds(
            scopes=["https://www.googleapis.com/auth/youtube.upload"], valid=True
        )
        monkeypatch.setattr(
            ya.Credentials, "from_authorized_user_file", staticmethod(lambda _p: so_upload)
        )
        with pytest.raises(ya.YoutubeAnalyticsError) as exc:
            ya.carregar_credenciais()
        assert exc.value.precisa_reautorizar is True

    def test_token_com_escopo_de_analytics_passa(self, tmp_path, monkeypatch):
        token = tmp_path / "token.json"
        token.write_text("{}", encoding="utf-8")
        segredo = tmp_path / "client_secrets.json"
        segredo.write_text("{}", encoding="utf-8")
        monkeypatch.setattr(ya, "youtube_token_path", lambda: token)
        monkeypatch.setattr(ya, "youtube_client_secrets_path", lambda: segredo)
        com_analytics = _FakeCreds(scopes=[ya.ANALYTICS_SCOPE], valid=True)
        monkeypatch.setattr(
            ya.Credentials, "from_authorized_user_file", staticmethod(lambda _p: com_analytics)
        )
        assert ya.carregar_credenciais() is com_analytics

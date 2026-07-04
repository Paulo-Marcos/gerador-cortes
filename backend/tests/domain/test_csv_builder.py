import json

import pytest
from app.domain.csv_builder import build_losslesscut_csv, build_single_cut_desvios_llc


class _Corte:
    """Stub simples para _CorteProtocol."""

    def __init__(self, numero, titulo, inicio_hms, fim_hms, inicio_seg, fim_seg, desvios=None):
        self.numero = numero
        self.titulo_proposto = titulo
        self.inicio_hms = inicio_hms
        self.fim_hms = fim_hms
        self.inicio_seg = inicio_seg
        self.fim_seg = fim_seg
        self.desvios = desvios


def _corte(
    numero=1,
    titulo="Título do Corte",
    inicio_hms="00:01:00.000",
    fim_hms="00:05:00.000",
    inicio_seg=60.0,
    fim_seg=300.0,
    desvios=None,
):
    return _Corte(numero, titulo, inicio_hms, fim_hms, inicio_seg, fim_seg, desvios)


class TestBuildLosslesscutCsv:
    def test_cabecalho_presente(self):
        result = build_losslesscut_csv([_corte()])
        assert result.startswith("start,end,name")

    def test_lista_vazia_retorna_apenas_cabecalho(self):
        result = build_losslesscut_csv([])
        assert result == "start,end,name"

    def test_uma_linha_por_corte(self):
        cortes = [_corte(1, "A"), _corte(2, "B")]
        linhas = build_losslesscut_csv(cortes).splitlines()
        assert len(linhas) == 3  # header + 2 cortes

    def test_inicio_e_fim_no_formato_srt(self):
        corte = _corte(inicio_hms="00:01:00", fim_hms="00:05:00")
        result = build_losslesscut_csv([corte])
        linhas = result.splitlines()
        campos = linhas[1].split(",")
        assert campos[0] == "00:01:00.000"
        assert campos[1] == "00:05:00.000"

    def test_nome_contem_numero_do_corte(self):
        corte = _corte(numero=3, titulo="Meu tema")
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert "Tema3_" in linhas[1]

    def test_nome_substitui_espacos_por_underscore(self):
        corte = _corte(titulo="Titulo Com Espacos")
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert " " not in linhas[1].split(",")[2]

    def test_titulo_truncado_em_40_chars(self):
        titulo_longo = "A" * 60
        corte = _corte(titulo=titulo_longo)
        linhas = build_losslesscut_csv([corte]).splitlines()
        nome = linhas[1].split(",")[2]
        # Parte do titulo (após "TemaX_") tem no máximo 40 chars
        nome_titulo = nome.split("_", 1)[1]
        assert len(nome_titulo) <= 40

    def test_desvio_gera_linha_extra(self):
        desvios = [
            {
                "inicio_hms": "00:02:00.000",
                "fim_hms": "00:02:30.000",
                "motivo": "Silêncio",
                "inicio_seg": 120.0,
            }
        ]
        corte = _corte(desvios=json.dumps(desvios))
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert len(linhas) == 3  # header + corte + desvio

    def test_desvio_nome_contem_prefixo(self):
        desvios = [
            {
                "inicio_hms": "00:02:00.000",
                "fim_hms": "00:02:30.000",
                "motivo": "Silêncio",
                "inicio_seg": 120.0,
            }
        ]
        corte = _corte(desvios=json.dumps(desvios))
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert "DESVIO_" in linhas[2]

    def test_sem_desvios_nao_gera_linhas_extras(self):
        corte = _corte(desvios=None)
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert len(linhas) == 2  # header + 1 corte

    def test_desvios_json_vazio_sem_linhas_extras(self):
        corte = _corte(desvios="[]")
        linhas = build_losslesscut_csv([corte]).splitlines()
        assert len(linhas) == 2


class TestBuildSingleCutDesviosLlc:
    def test_retorna_tupla_csv_e_json(self):
        corte = _corte()
        result = build_single_cut_desvios_llc(corte, "arquivo")
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_csv_tem_cabecalho(self):
        corte = _corte()
        csv, _ = build_single_cut_desvios_llc(corte, "arquivo")
        assert csv.startswith("start,end,name")

    def test_llc_e_json_valido(self):
        corte = _corte()
        _, llc = build_single_cut_desvios_llc(corte, "arquivo")
        data = json.loads(llc)
        assert isinstance(data, dict)

    def test_llc_tem_version_1(self):
        corte = _corte()
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert data["version"] == 1

    def test_llc_mediafilename_usa_stem(self):
        corte = _corte()
        _, llc = build_single_cut_desvios_llc(corte, "meu_video")
        data = json.loads(llc)
        assert "meu_video" in data["mediaFileName"]

    def test_llc_cutSegments_e_lista(self):
        corte = _corte()
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert isinstance(data["cutSegments"], list)

    def test_primeiro_segmento_e_limite_corte(self):
        corte = _corte()
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert "LIMITE_CORTE__" in data["cutSegments"][0]["name"]

    def test_limite_relativo_comeca_em_zero_independente_do_inicio(self):
        # Sem padding: as coordenadas relativas sempre começam em 0,
        # qualquer que seja o inicio_seg do corte.
        corte = _corte(inicio_seg=60.0, fim_seg=120.0)
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert data["cutSegments"][0]["start"] == pytest.approx(0.0)

    def test_limite_relativo_fim_e_duracao_do_corte(self):
        # Limite final relativo = fim_seg - inicio_seg.
        corte = _corte(inicio_seg=60.0, fim_seg=120.0)
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert data["cutSegments"][0]["end"] == pytest.approx(60.0)

    def test_corte_no_inicio_limite_zero(self):
        corte = _corte(inicio_seg=0.0, fim_seg=60.0)
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert data["cutSegments"][0]["start"] == pytest.approx(0.0)

    def test_desvio_gera_segmento_extra_no_llc(self):
        desvios = [
            {
                "inicio_seg": 90.0,
                "fim_seg": 100.0,
                "motivo": "Silêncio",
                "inicio_hms": "00:01:30.000",
                "fim_hms": "00:01:40.000",
            }
        ]
        corte = _corte(inicio_seg=60.0, fim_seg=300.0, desvios=json.dumps(desvios))
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert len(data["cutSegments"]) == 2
        # Desvio em 90→100 no tempo absoluto, sem padding → 30→40 no relativo.
        assert data["cutSegments"][1]["start"] == pytest.approx(30.0)
        assert data["cutSegments"][1]["end"] == pytest.approx(40.0)

    def test_nome_desvio_contem_remover(self):
        desvios = [
            {
                "inicio_seg": 90.0,
                "fim_seg": 100.0,
                "motivo": "Silêncio",
                "inicio_hms": "00:01:30.000",
                "fim_hms": "00:01:40.000",
            }
        ]
        corte = _corte(inicio_seg=60.0, fim_seg=300.0, desvios=json.dumps(desvios))
        _, llc = build_single_cut_desvios_llc(corte, "stem")
        data = json.loads(llc)
        assert "REMOVER_DESVIO_" in data["cutSegments"][1]["name"]

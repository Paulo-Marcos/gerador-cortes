import pytest
from app.domain.cinema_filters import FILTROS_CINEMA, get_filtro_vf


class TestGetFiltroVf:
    def test_nenhum_retorna_none(self):
        assert get_filtro_vf("nenhum") is None

    def test_filtro_inexistente_retorna_none(self):
        assert get_filtro_vf("filtro_que_nao_existe") is None

    # Lista única de IDs ativos — usada nos três parametrize abaixo.
    # Atualizar aqui quando adicionar/remover filtros mantém os testes em sincronia.
    FILTROS_ATIVOS = [
        "cinematic_iii",
        "bypass_dourado_aberto",
    ]

    @pytest.mark.parametrize("filtro", FILTROS_ATIVOS)
    def test_filtros_validos_retornam_string(self, filtro):
        result = get_filtro_vf(filtro)
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.parametrize("filtro", FILTROS_ATIVOS)
    def test_resultado_nao_contem_aspas_duplas_externas(self, filtro):
        # O resultado NÃO deve ser envolvido em aspas duplas — o subprocess
        # passa cada argumento separadamente, sem shell interpolation.
        # Aspas simples internas (ex: curves=r='0/0.05...') são sintaxe FFmpeg válida.
        result = get_filtro_vf(filtro)
        assert not result.startswith('"')
        assert not result.endswith('"')

    @pytest.mark.parametrize("filtro", FILTROS_ATIVOS)
    def test_resultado_une_lista_com_virgula(self, filtro):
        vf_data = FILTROS_CINEMA[filtro]["vf"]
        if isinstance(vf_data, list):
            result = get_filtro_vf(filtro)
            partes = result.split(",")
            # Resultado deve ter múltiplas partes unidas por vírgula
            assert len(partes) >= len(vf_data)

    def test_cinematic_iii_contem_curves(self):
        # Cine III é a única referência que ainda usa curves — checa que o
        # único filtro pesado restante tem todas as camadas esperadas.
        result = get_filtro_vf("cinematic_iii")
        assert "curves" in result
        assert "vignette" in result

    @pytest.mark.parametrize(
        "filtro",
        [
            "bypass_dourado_aberto",
        ],
    )
    def test_paletas_leves_nao_usam_curves_nem_vignette(self, filtro):
        # Garantia central das paletas leves: não pode usar os filtros pesados,
        # senão perdem a vantagem de custo que é a razão de existir.
        result = get_filtro_vf(filtro)
        assert "curves" not in result
        assert "vignette" not in result

    @pytest.mark.parametrize("filtro", FILTROS_ATIVOS)
    def test_todos_contem_letterbox(self, filtro):
        # Letterbox 2.35:1 é assinatura visual — todos os filtros devem ter.
        result = get_filtro_vf(filtro)
        assert "drawbox" in result


class TestFiltrosCinemaDict:
    def test_todos_filtros_tem_nome(self):
        for key, val in FILTROS_CINEMA.items():
            assert "nome" in val, f"Filtro '{key}' não tem 'nome'"

    def test_todos_filtros_tem_descricao(self):
        for key, val in FILTROS_CINEMA.items():
            assert "descricao" in val, f"Filtro '{key}' não tem 'descricao'"

    def test_todos_filtros_tem_chave_vf(self):
        for key, val in FILTROS_CINEMA.items():
            assert "vf" in val, f"Filtro '{key}' não tem 'vf'"

    def test_nenhum_nao_e_opcao_ativa(self):
        assert "nenhum" not in FILTROS_CINEMA

    def test_filtros_com_lista_nao_tem_elementos_vazios(self):
        for key, val in FILTROS_CINEMA.items():
            vf = val.get("vf")
            if isinstance(vf, list):
                for item in vf:
                    assert item, f"Filtro '{key}' tem elemento vazio na lista vf"

"""D-422: categoria editorial do trecho a remover."""

import pytest
from app.domain.corte.desvio_categoria import (
    AVISO_IMPRECISAO,
    CATEGORIAS,
    classificar_desvio,
    inferir_categoria_do_motivo,
    motivo_com_aviso,
    normalizar_categoria,
)


@pytest.mark.parametrize(
    ("bruto", "esperado"),
    [
        ("repeticao", "repeticao"),
        ("REPETIÇÃO", "repeticao"),
        ("DESVIO", "tangente"),
        ("desvio ESTRUTURAL", "tangente"),
        ("imprecisao", "imprecisao"),
        ("IMPRECISÃO", "imprecisao"),
        ("tecnico", "silencio"),
        ("hesitacao", "disfluencia"),
    ],
)
def test_normaliza_rotulo_do_modelo_para_vocabulario_canonico(bruto, esperado):
    assert normalizar_categoria(bruto) == esperado
    assert esperado in CATEGORIAS


def test_categoria_desconhecida_cai_na_inferencia_pelo_motivo():
    assert normalizar_categoria("blablabla", "repetição da tese central") == "repeticao"


def test_categoria_e_motivo_ilegiveis_viram_outro():
    assert normalizar_categoria(None, "") == "outro"
    assert normalizar_categoria("xyz", "trecho qualquer") == "outro"


@pytest.mark.parametrize(
    ("motivo", "esperado"),
    [
        ("Silêncio Detectado (IA/Técnico)", "silencio"),
        ("possivelmente errado: data da guerra", "imprecisao"),
        ("muletas e reações soltas após o vídeo", "disfluencia"),
        ("checagem com a audiência e repetição", "repeticao"),
        ("digressão sobre utilitarismo", "tangente"),
        ("interação com o chat", "chat"),
        ("enrolação procurando o link", "enrolacao"),
        ("desabafo pessoal", "tom"),
    ],
)
def test_infere_categoria_de_desvios_legados_pelo_motivo(motivo, esperado):
    assert inferir_categoria_do_motivo(motivo) == esperado


def test_motivo_de_imprecisao_ganha_aviso_explicito():
    assert motivo_com_aviso("a guerra foi em 1913", "imprecisao").startswith(AVISO_IMPRECISAO)


def test_aviso_nao_duplica_quando_a_skill_ja_sinalizou():
    motivo = "Trecho impreciso: número de mortos parece inflado"
    assert motivo_com_aviso(motivo, "imprecisao") == motivo


def test_motivo_de_outras_categorias_fica_intacto():
    assert motivo_com_aviso("repetição da tese", "repeticao") == "repetição da tese"


def test_classificar_preserva_campos_e_nao_muta_entrada():
    original = {
        "inicio_hms": "00:10:00",
        "fim_hms": "00:10:08",
        "categoria": "IMPRECISÃO",
        "motivo": "diz que o PIB caiu 10%",
        "origem": "claude",
        "inicio_texto": "diz que o PIB",
    }
    resultado = classificar_desvio(original)

    assert resultado["categoria"] == "imprecisao"
    assert resultado["motivo"].startswith(AVISO_IMPRECISAO)
    assert resultado["origem"] == "claude"
    assert resultado["inicio_texto"] == "diz que o PIB"
    assert original["categoria"] == "IMPRECISÃO", "entrada não deve ser mutada"


def test_classificar_aceita_tipo_do_fluxo_manual():
    assert classificar_desvio({"tipo": "REPETICAO", "motivo": "x"})["categoria"] == "repeticao"

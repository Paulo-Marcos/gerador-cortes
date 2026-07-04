from app.domain.reading_metadata import (
    aplicar_emojis_texto_capa,
    aplicar_prefixo_leitura_titulo,
    remover_prefixo_leitura_titulo,
)


def test_aplica_prefixo_leitura_com_autor_e_parte():
    assert (
        aplicar_prefixo_leitura_titulo("A ética da liberdade", "Spinozza", 1)
        == "Leitura - Spinozza - PT.1 | A ética da liberdade"
    )


def test_atualiza_prefixo_de_leitura_existente():
    titulo = "Leitura - Marx - PT.2 | A ética da liberdade"

    assert (
        aplicar_prefixo_leitura_titulo(titulo, "Spinozza", 3)
        == "Leitura - Spinozza - PT.3 | A ética da liberdade"
    )


def test_remove_prefixo_antigo_de_leitura():
    titulo = "Leitura | Marx - A crítica da política"

    assert remover_prefixo_leitura_titulo(titulo) == "A crítica da política"


def test_acumula_fogo_e_livro_no_texto_da_capa_sem_duplicar():
    assert aplicar_emojis_texto_capa("🔥 📖 REALIDADE", True, True) == "🔥 📖 REALIDADE"


def test_remove_emojis_quando_flags_desligam():
    assert aplicar_emojis_texto_capa("🔥 📖 REALIDADE", False, False) == "REALIDADE"

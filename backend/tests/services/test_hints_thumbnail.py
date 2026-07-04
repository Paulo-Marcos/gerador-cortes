"""F-058: bloco de influência manual do editor no prompt da thumbnail."""

from app.services.metadados import formatar_bloco_hints_thumbnail


def test_bloco_vazio_quando_sem_hints():
    assert formatar_bloco_hints_thumbnail("") == ""
    assert formatar_bloco_hints_thumbnail("   ") == ""
    assert formatar_bloco_hints_thumbnail(None) == ""


def test_bloco_inclui_texto_do_editor():
    bloco = formatar_bloco_hints_thumbnail("Destacar o Fulano e relacionar com Cicrano.")
    assert "SUGESTÕES DO EDITOR PARA A CAPA" in bloco
    assert "Destacar o Fulano e relacionar com Cicrano." in bloco
    # PRIORIDADE sinaliza ao capista que deve incorporar a direção.
    assert "PRIORIDADE" in bloco


def test_bloco_remove_espacos_nas_pontas():
    bloco = formatar_bloco_hints_thumbnail("  tema X é o mais importante  ")
    assert "tema X é o mais importante" in bloco
    assert "  tema X" not in bloco

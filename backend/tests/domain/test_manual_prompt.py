from app.domain.manual_prompt import pedir_resposta_json_em_bloco_codigo


def test_pedir_resposta_json_em_bloco_codigo_acrescenta_instrucao():
    prompt = pedir_resposta_json_em_bloco_codigo("Retorne o JSON.")

    assert "```json" in prompt
    assert "somente JSON valido" in prompt
    assert prompt.startswith("Retorne o JSON.")


def test_pedir_resposta_json_em_bloco_codigo_nao_duplica_instrucao():
    prompt = pedir_resposta_json_em_bloco_codigo("Retorne o JSON.")

    assert pedir_resposta_json_em_bloco_codigo(prompt) == prompt

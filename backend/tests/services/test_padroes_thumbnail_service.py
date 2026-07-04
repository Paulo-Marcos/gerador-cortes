"""D-070: serviço de análise de padrões dos melhores prompts de thumbnail."""

import pytest
from app.services import padroes_thumbnail as padroes_module
from app.services.padroes_thumbnail import PadroesThumbnailService


def _avaliacao(veredito: str, cenario: str, paleta: str) -> dict:
    return {
        "veredito": veredito,
        "comentario": "",
        "prompt_snapshot": (
            f'[VARIATION_TAGS] cenario="{cenario}" | paleta="{paleta}"\n\nScene...'
        ),
    }


def _fake_historico(avaliacoes: list[dict]):
    async def _listar(limite=200):
        return {"avaliacoes": avaliacoes, "resumo": {}}

    return _listar


@pytest.mark.asyncio
async def test_analisar_caminho_feliz_chama_agente_e_devolve_padroes(monkeypatch):
    avaliacoes = [
        _avaliacao("otimo", "tribunal", "vermelho"),
        _avaliacao("bom", "tribunal", "azul"),
        _avaliacao("bom", "praça", "azul"),
        _avaliacao("ruim", "deserto", "bege"),  # negativo: ignorado
    ]
    monkeypatch.setattr(
        padroes_module.AvaliacaoThumbnailService,
        "listar_recentes",
        staticmethod(_fake_historico(avaliacoes)),
    )

    prompts_vistos: list[str] = []

    async def _fake_generate_json(prompt, **kwargs):
        prompts_vistos.append(prompt)
        return {
            "resumo": "Tribunais escuros dominam os melhores.",
            "padroes": [
                {"eixo": "cenario", "padrao": "tribunal", "evidencia": "x", "forca": "alta"}
            ],
            "proposta_ajuste_skill": "Priorizar cenários institucionais concretos.",
        }

    monkeypatch.setattr(padroes_module.claude_cli_client, "generate_json", _fake_generate_json)

    resultado = await PadroesThumbnailService.analisar()

    assert resultado["status"] == "ok"
    assert resultado["total_melhores"] == 3  # só os positivos com prompt
    assert resultado["com_tags"] == 3
    # O agente recebeu a frequência agregada dos eixos.
    assert "tribunal" in prompts_vistos[0]
    # A análise do agente volta intacta.
    assert resultado["analise"]["padroes"][0]["eixo"] == "cenario"


@pytest.mark.asyncio
async def test_analisar_com_poucos_melhores_nao_chama_agente(monkeypatch):
    monkeypatch.setattr(
        padroes_module.AvaliacaoThumbnailService,
        "listar_recentes",
        staticmethod(_fake_historico([_avaliacao("bom", "rua", "azul")])),
    )

    def _explode(*args, **kwargs):  # pragma: no cover - não deve ser chamado
        raise AssertionError("não deveria chamar o agente com amostra pequena")

    monkeypatch.setattr(padroes_module.claude_cli_client, "generate_json", _explode)

    resultado = await PadroesThumbnailService.analisar()

    assert resultado["status"] == "dados_insuficientes"
    assert resultado["total_melhores"] == 1
    assert resultado["analise"] is None

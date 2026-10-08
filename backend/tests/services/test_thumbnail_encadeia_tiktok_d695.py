"""O prompt da thumbnail encadeia o prompt da capa do TikTok (D-525, D-695).

Teste de caracterização do único trecho do caso de uso da thumbnail que não
tinha teste: depois de gravar o prompt do YouTube, ele agenda em segundo plano
o prompt da arte do TikTok, e uma falha ali não derruba a entrega principal.
As duas referências que o movimento do D-695 troca ficam no topo.
"""

import asyncio

import pytest
from app.infrastructure import claude_cli_client
from app.services import capa_tiktok, metadados
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.metadados import MetadadosService

modulo_do_caso_de_uso = metadados
gerar_prompt_da_thumbnail = MetadadosService.gerar_prompt_thumbnail_via_claude


@pytest.fixture(autouse=True)
def fila_do_chatgpt(monkeypatch):
    """D-899: o que o prompt escrito pôs na fila do ChatGPT (sem robô de verdade)."""
    pedidos: list[tuple] = []

    async def pedir_sozinho(*argumentos):
        pedidos.append(argumentos)

    monkeypatch.setattr(modulo_do_caso_de_uso, "pedir_sozinho", pedir_sozinho)
    return pedidos


@pytest.fixture
def agendados(monkeypatch):
    """O caso de uso roda com as bordas trocadas; o que ele agenda fica registrado."""

    async def contexto(_corte_id):
        return {
            "tema": "juros",
            "titulo_youtube": "T",
            "texto_capa": "C",
            "resumo": "r",
            "transcricao": "fala do corte",
            "historico_visual": "-",
        }

    async def importar(_corte_id, _prompt):
        return None

    async def gerar_texto(_prompt, **_argumentos):
        return "Editorial 2D thumbnail, 16:9, the frog mascot at a desk."

    monkeypatch.setattr(MetadadosService, "montar_contexto_thumbnail", staticmethod(contexto))
    monkeypatch.setattr(MetadadosService, "importar_prompt_thumbnail", staticmethod(importar))
    monkeypatch.setattr(claude_cli_client, "generate_text", gerar_texto)
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key, corpo="capista", modelo="opus", thinking_tokens=0, timeout=60.0, lentes=[]
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: editorial_scaffolds._default_scaffold(
            editorial_scaffolds._exigir_catalogo(key)
        ),
    )

    registro: list[tuple] = []

    def agendar(coroutine, *, name):
        registro.append((name, coroutine))

    monkeypatch.setattr(modulo_do_caso_de_uso, "fire_and_forget", agendar)
    return registro


def test_gravar_o_prompt_do_youtube_agenda_o_da_capa_do_tiktok(
    agendados, monkeypatch, fila_do_chatgpt
):
    pedidos = []

    async def gerar_prompt_da_arte(corte_id):
        pedidos.append(corte_id)
        return "a arte"

    monkeypatch.setattr(capa_tiktok, "gerar_prompt_da_arte", gerar_prompt_da_arte)

    async def cenario():
        resultado = await gerar_prompt_da_thumbnail("c1")
        (nome, agendado) = agendados[0]
        await agendado
        return resultado, nome

    resultado, nome = asyncio.run(cenario())

    assert resultado == {"ok": True}
    assert nome == "capa-tiktok-prompt-c1"
    assert pedidos == ["c1"]
    # D-899: a arte encadeada também vai para a fila do ChatGPT.
    assert fila_do_chatgpt[-1] == ("tiktok", "c1", "a arte")


def test_falha_no_tiktok_nao_escapa_do_encadeamento(agendados, monkeypatch):
    async def falha(_corte_id):
        raise RuntimeError("agente fora do ar")

    monkeypatch.setattr(capa_tiktok, "gerar_prompt_da_arte", falha)

    async def cenario():
        await gerar_prompt_da_thumbnail("c1")
        (_, agendado) = agendados[0]
        await agendado  # não pode levantar: o TikTok é acessório

    asyncio.run(cenario())


def test_o_prompt_do_youtube_vai_para_a_fila_do_chatgpt(agendados, fila_do_chatgpt):
    # D-899: o "Gerar prompt" já pede a imagem, antes de encadear o TikTok.
    asyncio.run(gerar_prompt_da_thumbnail("c1"))

    assert fila_do_chatgpt == [
        ("youtube", "c1", "Editorial 2D thumbnail, 16:9, the frog mascot at a desk.")
    ]

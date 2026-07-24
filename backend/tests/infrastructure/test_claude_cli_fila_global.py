"""O client de IA anuncia a chamada na fila global (D-417).

As chamadas Claude rodam SÍNCRONAS dentro do request (a análise da transcrição
leva minutos), então este anúncio é a única forma de o operador saber que há IA
em andamento. Aqui o subprocess é stubado — o que se testa é a instrumentação,
não o Claude.
"""

import pytest
from app.infrastructure import claude_cli_client
from app.services.tarefas_ativas import TarefasAtivas

CONTEXTO = claude_cli_client.LlmCallContext(etapa="cortador-expert", projeto_id="p1", corte_id=None)
CHAVE = "ia:cortador-expert:p1"


@pytest.fixture(autouse=True)
def _sem_telemetria_nem_registro(monkeypatch):
    """Isola a fila: telemetria vira no-op e o registro começa vazio."""
    monkeypatch.setattr(claude_cli_client, "_registrar_telemetria", lambda **_: None)
    TarefasAtivas.limpar()
    yield
    TarefasAtivas.limpar()


def _stub_run(monkeypatch, *, resultado: str = "ok", excecao: Exception | None = None):
    async def _fake_run(*_args, **_kwargs):
        if excecao is not None:
            raise excecao
        return {"result": resultado}

    monkeypatch.setattr(claude_cli_client, "_run", _fake_run)


@pytest.mark.asyncio
async def test_chamada_bem_sucedida_entra_e_sai_como_concluida(monkeypatch):
    _stub_run(monkeypatch, resultado="texto gerado")

    await claude_cli_client.generate_text("prompt", contexto=CONTEXTO)

    tarefa = TarefasAtivas.listar()[0]
    assert tarefa.chave == CHAVE
    assert tarefa.tipo == "analise"
    assert tarefa.etapa == "Analisando transcrição"
    assert tarefa.estado == "concluido"
    assert tarefa.projeto_id == "p1"


@pytest.mark.asyncio
async def test_falha_do_cli_deixa_o_job_em_erro_com_a_mensagem(monkeypatch):
    _stub_run(monkeypatch, excecao=claude_cli_client.ClaudeCliError("binário não encontrado"))

    with pytest.raises(claude_cli_client.ClaudeCliError):
        await claude_cli_client.generate_text("prompt", contexto=CONTEXTO)

    tarefa = TarefasAtivas.listar()[0]
    assert tarefa.estado == "erro"
    assert tarefa.erro == "binário não encontrado"


@pytest.mark.asyncio
async def test_erro_inesperado_nao_deixa_o_job_preso_em_rodando(monkeypatch):
    _stub_run(monkeypatch, excecao=RuntimeError("event loop morreu"))

    with pytest.raises(RuntimeError):
        await claude_cli_client.generate_text("prompt", contexto=CONTEXTO)

    assert TarefasAtivas.listar()[0].estado == "erro"


@pytest.mark.asyncio
async def test_cancelamento_tambem_encerra_o_job(monkeypatch):
    import asyncio

    _stub_run(monkeypatch, excecao=asyncio.CancelledError())

    with pytest.raises(asyncio.CancelledError):
        await claude_cli_client.generate_text("prompt", contexto=CONTEXTO)

    assert TarefasAtivas.listar()[0].estado == "erro"


@pytest.mark.asyncio
async def test_resposta_que_nao_e_json_conta_como_falha(monkeypatch):
    """A chamada foi bem, mas o resultado é inútil — a fila precisa mostrar erro."""
    _stub_run(monkeypatch, resultado="isto não é json")

    with pytest.raises(ValueError):
        await claude_cli_client.generate_json("prompt", contexto=CONTEXTO)

    assert TarefasAtivas.listar()[0].estado == "erro"


@pytest.mark.asyncio
async def test_skill_sem_mapeamento_ainda_aparece_como_ia_generica(monkeypatch):
    _stub_run(monkeypatch, resultado="ok")

    await claude_cli_client.generate_text(
        "prompt",
        contexto=claude_cli_client.LlmCallContext(etapa="skill-inedita", corte_id="c9"),
    )

    tarefa = TarefasAtivas.listar()[0]
    assert tarefa.tipo == "ia"
    assert tarefa.etapa == "Consultando IA"
    assert tarefa.corte_id == "c9"


@pytest.mark.asyncio
async def test_falha_ao_registrar_na_fila_nao_quebra_a_geracao(monkeypatch):
    """Invariante da instrumentação: a fila nunca pode derrubar uma geração."""
    _stub_run(monkeypatch, resultado="texto gerado")

    def _explode(*_args, **_kwargs):
        raise RuntimeError("registro indisponível")

    monkeypatch.setattr(TarefasAtivas, "iniciar", _explode)
    monkeypatch.setattr(TarefasAtivas, "encerrar", _explode)

    assert await claude_cli_client.generate_text("prompt", contexto=CONTEXTO) == "texto gerado"

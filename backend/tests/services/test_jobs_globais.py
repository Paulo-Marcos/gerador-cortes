import pytest
import pytest_asyncio
from app.core.tarefas_ativas import TarefasAtivas
from app.models import Base, Corte, Projeto
from app.services.bruto_progress import BrutoProgress
from app.services.export import ExportService
from app.services.jobs_globais import RETENCAO_TERMINAL_SEG, JobsGlobais
from app.services.render_progress import RenderProgressStore
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture(autouse=True)
def _stores_limpos():
    """Cada teste começa com todos os stores e a memória de transições zerados."""
    JobsGlobais.resetar()
    RenderProgressStore._progress.clear()
    BrutoProgress._store.clear()
    TarefasAtivas.limpar()
    ExportService._tarefas_corte.clear()
    ExportService._fila_processamento.clear()
    ExportService._fila_youtube.clear()
    yield
    JobsGlobais.resetar()
    RenderProgressStore._progress.clear()
    BrutoProgress._store.clear()
    TarefasAtivas.limpar()
    ExportService._tarefas_corte.clear()
    ExportService._fila_processamento.clear()
    ExportService._fila_youtube.clear()


@pytest_asyncio.fixture
async def db():
    """Banco em memória com um projeto ("LIVE 265") e o corte 7."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as sessao:
        sessao.add(
            Projeto(id="proj1234-aaaa", youtube_url="http://y/1", titulo_live="LIVE 265 — teste")
        )
        sessao.add(Corte(id="cort5678-bbbb", projeto_id="proj1234-aaaa", numero=7))
        await sessao.commit()
        yield sessao
    await engine.dispose()


def _por_id(jobs) -> dict:
    return {job.id: job for job in jobs}


def test_render_rodando_entra_na_fila():
    RenderProgressStore.start("c1")
    RenderProgressStore.update("c1", 42, "Fase 2/4")

    job = _por_id(JobsGlobais.coletar(agora=1_000.0))["render:c1"]

    assert job.tipo == "render"
    assert job.estado == "rodando"
    assert job.progresso == 42
    assert job.etapa == "Fase 2/4"
    assert job.ativo


def test_job_ja_terminal_na_primeira_observacao_nao_polui_a_fila():
    """Render que acabou antes de o coletor existir não deve reaparecer no boot."""
    RenderProgressStore.start("c1")
    RenderProgressStore.done("c1")

    assert JobsGlobais.coletar(agora=1_000.0) == []


def test_transicao_para_concluido_fica_visivel_e_depois_expira():
    RenderProgressStore.start("c1")
    assert "render:c1" in _por_id(JobsGlobais.coletar(agora=1_000.0))

    RenderProgressStore.done("c1")
    concluido = _por_id(JobsGlobais.coletar(agora=1_001.0))["render:c1"]
    assert concluido.estado == "concluido"
    assert concluido.progresso == 100

    # Passada a janela de retenção, o backend para de publicar — a UI é quem
    # segura o item até o operador remover.
    assert JobsGlobais.coletar(agora=1_001.0 + RETENCAO_TERMINAL_SEG) == []


def test_render_com_erro_carrega_a_mensagem():
    RenderProgressStore.start("c1")
    JobsGlobais.coletar(agora=1_000.0)
    RenderProgressStore.error("c1", "ffmpeg morreu")

    job = _por_id(JobsGlobais.coletar(agora=1_001.0))["render:c1"]

    assert job.estado == "erro"
    assert job.erro == "ffmpeg morreu"


def test_bruto_usa_o_passo_rodando_como_etapa():
    ExportService.set_tarefa_corte_status("c1", "cortando")
    BrutoProgress.iniciar("c1")
    BrutoProgress.marcar("c1", "silencios", "concluido")
    BrutoProgress.marcar("c1", "render", "rodando")

    job = _por_id(JobsGlobais.coletar(agora=1_000.0))["bruto:c1"]

    assert job.tipo == "bruto"
    assert job.estado == "rodando"
    assert job.etapa == "Renderizar vídeo bruto"
    assert job.progresso == 25  # 1 de 4 passos


def test_bruto_segue_rodando_enquanto_as_cenas_nao_terminam():
    """Status vira 'pronto' antes das cenas (Claude); o passo é que manda."""
    ExportService.set_tarefa_corte_status("c1", "pronto")
    BrutoProgress.iniciar("c1")
    for chave in ("silencios", "render", "transcricao"):
        BrutoProgress.marcar("c1", chave, "concluido")
    BrutoProgress.marcar("c1", "cenas", "rodando")

    job = _por_id(JobsGlobais.coletar(agora=1_000.0))["bruto:c1"]

    assert job.estado == "rodando"
    assert job.etapa == "Gerar cenas (Claude)"


def test_bruto_com_erro_no_status_expoe_a_mensagem():
    ExportService.set_tarefa_corte_status("c1", "cortando")
    JobsGlobais.coletar(agora=1_000.0)
    ExportService.set_tarefa_corte_status("c1", "erro: sem espaço em disco")

    job = _por_id(JobsGlobais.coletar(agora=1_001.0))["bruto:c1"]

    assert job.estado == "erro"
    assert job.erro == "sem espaço em disco"


def test_fila_da_pos_vira_um_job_por_corte():
    ExportService._fila_processamento["p1"] = {"c1": "processando", "c2": "aguardando"}

    jobs = _por_id(JobsGlobais.coletar(agora=1_000.0))

    assert jobs["pos:c1"].estado == "rodando"
    assert jobs["pos:c1"].projeto_id == "p1"
    assert jobs["pos:c2"].estado == "aguardando"
    assert jobs["pos:c2"].etapa == "Na fila da pós"


def test_cota_do_youtube_excedida_vira_erro_explicado():
    ExportService._fila_youtube["p1"] = {"c1": "cota_excedida"}
    ExportService._fila_youtube["p1"]["c1"] = "enviando"
    JobsGlobais.coletar(agora=1_000.0)
    ExportService._fila_youtube["p1"]["c1"] = "cota_excedida"

    job = _por_id(JobsGlobais.coletar(agora=1_001.0))["youtube:c1"]

    assert job.estado == "erro"
    assert job.etapa == "Cota do YouTube excedida"
    assert "reset" in job.erro


def test_as_quatro_operacoes_convivem_na_mesma_fila():
    ExportService.set_tarefa_corte_status("c1", "cortando")
    ExportService._fila_processamento["p1"] = {"c2": "processando"}
    RenderProgressStore.start("c3")
    ExportService._fila_youtube["p1"] = {"c4": "enviando"}

    tipos = {job.tipo for job in JobsGlobais.coletar(agora=1_000.0)}

    assert tipos == {"bruto", "pos", "render", "youtube"}


def test_consulta_de_ia_entra_na_fila_com_familia_e_rotulo():
    """A análise roda SÍNCRONA no request — sem isto ela não aparece em lugar nenhum."""
    TarefasAtivas.iniciar(
        "ia:cortador-expert:p1",
        tipo="analise",
        etapa="Analisando transcrição",
        projeto_id="p1",
    )

    job = _por_id(JobsGlobais.coletar(agora=1_000.0))["ia:cortador-expert:p1"]

    assert job.tipo == "analise"
    assert job.familia == "ia"
    assert job.rotulo_tipo == "análise"
    assert job.estado == "rodando"
    assert job.projeto_id == "p1"


def test_tipo_de_ia_desconhecido_ainda_tem_familia_ia():
    TarefasAtivas.iniciar("ia:skill-nova:c1", tipo="ia", etapa="Consultando IA", corte_id="c1")

    job = _por_id(JobsGlobais.coletar(agora=1_000.0))["ia:skill-nova:c1"]

    assert job.familia == "ia"
    assert job.rotulo_tipo == "IA"


def test_render_e_ia_convivem_na_mesma_fila():
    RenderProgressStore.start("c1")
    TarefasAtivas.iniciar("ia:cenas-expert:c2", tipo="cenas", etapa="Gerando cenas", corte_id="c2")

    familias = {job.familia for job in JobsGlobais.coletar(agora=1_000.0)}

    assert familias == {"midia", "ia"}


@pytest.mark.asyncio
async def test_descritos_resolvem_corte_pelo_id_completo(db):
    TarefasAtivas.iniciar(
        "ia:cenas-expert:cort5678-bbbb",
        tipo="cenas",
        etapa="Gerando cenas",
        corte_id="cort5678-bbbb",
    )

    (descrito,) = await JobsGlobais.coletar_descritos(db)

    assert descrito["corte_numero"] == 7
    assert descrito["projeto_titulo"] == "LIVE 265 — teste"
    assert descrito["projeto_id"] == "proj1234-aaaa"
    assert descrito["rotulo_tipo"] == "cenas"


@pytest.mark.asyncio
async def test_descritos_resolvem_o_prefixo_de_8_chars_do_nome_da_task(db):
    """`metadados-cort5678` é tudo que o nome da background task carrega."""
    TarefasAtivas.iniciar(
        "task:metadados-cort5678",
        tipo="metadados",
        etapa="Gerando metadados",
        corte_prefixo="cort5678",
    )

    (descrito,) = await JobsGlobais.coletar_descritos(db)

    assert descrito["corte_id"] == "cort5678-bbbb"
    assert descrito["corte_numero"] == 7


@pytest.mark.asyncio
async def test_job_de_escopo_projeto_vem_sem_numero_de_corte(db):
    TarefasAtivas.iniciar(
        "task:ingestao-proj1234",
        tipo="ingestao",
        etapa="Baixando e transcrevendo",
        projeto_prefixo="proj1234",
    )

    (descrito,) = await JobsGlobais.coletar_descritos(db)

    assert descrito["corte_numero"] is None
    assert descrito["corte_id"] == ""
    assert descrito["projeto_titulo"] == "LIVE 265 — teste"


@pytest.mark.asyncio
async def test_job_de_corte_apagado_nao_vai_para_a_fila(db):
    TarefasAtivas.iniciar(
        "ia:cenas-expert:sumiu", tipo="cenas", etapa="Gerando cenas", corte_id="sumiu"
    )

    assert await JobsGlobais.coletar_descritos(db) == []


def test_memoria_de_transicoes_nao_cresce_indefinidamente():
    RenderProgressStore.start("c1")
    JobsGlobais.coletar(agora=1_000.0)
    RenderProgressStore._progress.clear()

    JobsGlobais.coletar(agora=1_001.0)

    assert JobsGlobais._transicoes == {}

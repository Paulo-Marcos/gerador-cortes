"""D-458: a lista de Fires que abre a tela de Shorts.

O filtro que importa e o de DISCO. Um corte Fire cujo bruto ja foi descartado
nao tem de onde recortar short — lista-lo so daria ao operador um item que
frustra quando ele clica. E a checagem precisa ser no ARQUIVO, nao no ponteiro:
o `arquivo_clip_path` pode continuar preenchido depois de alguem apagar a pasta
por fora do app.
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)

    yield factory, tmp_path
    await engine.dispose()


def _criar_bruto(raiz, corte_id: str) -> str:
    corte_dir = raiz / "p1" / "cortes" / corte_id
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * (3 * 1024 * 1024))
    return f"cortes/{corte_id}/clip_raw_1.mkv"


async def _semear(
    factory,
    *,
    corte_id: str,
    fire: bool,
    clip_path: str = "",
    numero: int = 1,
    com_metadado: bool = True,
) -> None:
    async with factory() as db:
        if await db.get(Projeto, "p1") is None:
            db.add(Projeto(id="p1", youtube_url="u", titulo_live="Live de terca"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="p1",
                numero=numero,
                titulo_proposto=f"Corte {numero}",
                tema_central="Economia",
                duracao_clip_seg=180.0,
                arquivo_clip_path=clip_path,
            )
        )
        if com_metadado:
            db.add(MetadadoCorte(id=f"m-{corte_id}", corte_id=corte_id, is_fire=fire))
        await db.commit()


@pytest.mark.asyncio
async def test_lista_o_fire_que_tem_bruto_em_disco(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))

    fires = await servico.listar_fires_com_bruto()

    assert len(fires) == 1
    assert fires[0]["corte_id"] == "c1"
    assert fires[0]["projeto_titulo"] == "Live de terca"
    assert fires[0]["bruto_mb"] == 3.1
    assert fires[0]["shorts"]["total"] == 0


@pytest.mark.asyncio
async def test_corte_comum_nao_entra_na_lista(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=False, clip_path=_criar_bruto(raiz, "c1"))

    assert await servico.listar_fires_com_bruto() == []


@pytest.mark.asyncio
async def test_fire_sem_bruto_no_disco_APARECE_marcado_como_sem_bruto(ambiente):
    """D-502 mudou esta regra, e o teste mudou junto em vez de sumir.

    Antes: "sem bruto nao ha o que recortar", entao o corte era escondido. Essa
    regra descrevia um beco sem saida que deixou de existir — a fabrica sabe
    regerar o bruto sem tocar na pos-producao (D-472). Escondendo, o operador
    tinha de voltar ao editor, regerar, e so entao vir; agora a propria tela
    oferece.

    Ponteiro preenchido continua nao bastando: o que vale e o arquivo em disco.
    """
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path="cortes/c1/clip_raw_1.mkv")

    fires = await servico.listar_fires_com_bruto()

    assert len(fires) == 1
    assert fires[0]["tem_bruto"] is False
    assert fires[0]["bruto_mb"] == 0.0, "sem arquivo nao se inventa tamanho"


@pytest.mark.asyncio
async def test_fire_sem_ponteiro_de_bruto_tambem_aparece(ambiente):
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path="")

    fires = await servico.listar_fires_com_bruto()

    assert len(fires) == 1 and fires[0]["tem_bruto"] is False


@pytest.mark.asyncio
async def test_corte_INDICADO_a_mao_entra_sem_ser_fire(ambiente):
    """D-502: Fire e sobre o CORTE; indicar e sobre um TRECHO dele.

    Um corte mediano pode ter um momento otimo, e obrigar a marcar Fire para
    chegar nele seria mentir sobre o corte inteiro.
    """
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=False, clip_path="")

    assert await servico.listar_fires_com_bruto() == []

    await servico.indicar_para_shorts("c1", True)
    fires = await servico.listar_fires_com_bruto()

    assert len(fires) == 1
    assert fires[0]["is_fire"] is False and fires[0]["indicado"] is True


@pytest.mark.asyncio
async def test_desindicar_tira_da_fila(ambiente):
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=False, clip_path="")
    await servico.indicar_para_shorts("c1", True)

    await servico.indicar_para_shorts("c1", False)

    assert await servico.listar_fires_com_bruto() == []


@pytest.mark.asyncio
async def test_indicar_corte_sem_metadado_nao_exige_etapa_anterior(ambiente):
    """Um corte que nunca passou por metadados tambem pode ter trecho bom."""
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=False, clip_path="", com_metadado=False)

    estado = await servico.indicar_para_shorts("c1", True)

    assert estado["candidato_shorts"] is True
    assert estado["elegivel"] is True


def _canal_fixo(monkeypatch, credito: str) -> None:
    from types import SimpleNamespace

    from app.services import channels

    monkeypatch.setattr(
        channels, "identidade_do_canal_ativo", lambda: SimpleNamespace(credito=credito)
    )


async def _credito_do_metadado(factory, corte_id: str) -> str:
    from sqlalchemy import select

    async with factory() as db:
        meta = (
            await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
        ).scalar_one()
        return meta.canal_credito


@pytest.mark.asyncio
async def test_metadado_nascido_da_indicacao_leva_o_credito_do_canal(ambiente, monkeypatch):
    """D-666: era o default do models.py que preenchia — agora é quem cria."""
    factory, _ = ambiente
    _canal_fixo(monkeypatch, "@canal-do-teste")
    await _semear(factory, corte_id="c1", fire=False, clip_path="", com_metadado=False)

    await servico.indicar_para_shorts("c1", True)

    assert await _credito_do_metadado(factory, "c1") == "@canal-do-teste"


@pytest.mark.asyncio
async def test_metadado_nascido_do_fire_leva_o_credito_do_canal(ambiente, monkeypatch):
    from app.services import metadados as metadados_module
    from app.services import thumbnail as thumbnail_module

    factory, _ = ambiente
    monkeypatch.setattr(metadados_module, "AsyncSessionLocal", factory)
    # O toggle re-emoldura a capa, e o ThumbnailService abre a sessão DELE.
    # Sem isto o teste lia o banco real da máquina (e no CI, sem banco, caía).
    monkeypatch.setattr(thumbnail_module, "AsyncSessionLocal", factory)
    _canal_fixo(monkeypatch, "@canal-do-teste")
    await _semear(factory, corte_id="c1", fire=False, clip_path="", com_metadado=False)

    await metadados_module.MetadadosService.toggle_fire("c1")

    assert await _credito_do_metadado(factory, "c1") == "@canal-do-teste"


@pytest.mark.asyncio
async def test_contagem_de_shorts_vem_por_status(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))
    async with factory() as db:
        db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.SUGERIDO))
        db.add(Short(id="s2", corte_id="c1", numero=2, status=StatusShort.SUGERIDO))
        db.add(Short(id="s3", corte_id="c1", numero=3, status=StatusShort.APROVADO))
        await db.commit()

    fires = await servico.listar_fires_com_bruto()

    assert fires[0]["shorts"]["total"] == 3
    assert fires[0]["shorts"]["sugerido"] == 2
    assert fires[0]["shorts"]["aprovado"] == 1
    assert fires[0]["shorts"]["renderizado"] == 0


@pytest.mark.asyncio
async def test_contagem_nao_vaza_entre_cortes(ambiente):
    """Uma consulta agrupada serve a lista inteira; o agrupamento tem de separar."""
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))
    await _semear(factory, corte_id="c2", fire=True, clip_path=_criar_bruto(raiz, "c2"), numero=2)
    async with factory() as db:
        db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.SUGERIDO))
        await db.commit()

    por_corte = {
        f["corte_id"]: f["shorts"]["total"] for f in await servico.listar_fires_com_bruto()
    }

    assert por_corte == {"c1": 1, "c2": 0}


@pytest.mark.asyncio
async def test_finalizar_carimba_o_corte_e_a_lista_informa(ambiente):
    """D-593: o finalizado continua na lista — quem o tira da fila e a tela."""
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))

    resposta = await servico.marcar_finalizado("c1", True)

    fires = await servico.listar_fires_com_bruto()
    assert resposta["finalizado_em"] is not None
    assert fires[0]["finalizado_em"] == resposta["finalizado_em"]


@pytest.mark.asyncio
async def test_finalizar_de_novo_nao_renova_a_data(ambiente):
    """O carimbo responde "quando fechei"; um segundo clique nao reescreve isso."""
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True)

    primeira = await servico.marcar_finalizado("c1", True)
    segunda = await servico.marcar_finalizado("c1", True)

    assert segunda["finalizado_em"] == primeira["finalizado_em"]


@pytest.mark.asyncio
async def test_reabrir_apaga_o_carimbo(ambiente):
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True)
    await servico.marcar_finalizado("c1", True)

    resposta = await servico.marcar_finalizado("c1", False)

    assert resposta["finalizado_em"] is None
    assert (await servico.listar_fires_com_bruto())[0]["finalizado_em"] is None


@pytest.mark.asyncio
async def test_finalizar_corte_inexistente_recusa(ambiente):
    with pytest.raises(LookupError):
        await servico.marcar_finalizado("nao-existe", True)

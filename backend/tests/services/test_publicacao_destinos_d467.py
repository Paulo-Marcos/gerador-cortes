"""D-467: o contrato que faz "manual agora, API depois" não virar reescrita.

Os dois modos são o MESMO fluxo — `preparar` → `PacotePublicacao` → `publicar` —
com transportes diferentes. O preparo é comum; só o `publicar` muda. Quando o
app review do Instagram e do TikTok sair, o destino novo entra no registro e
nada mais muda.
"""

import json

import pytest
import pytest_asyncio
from app.domain.publicacao.publicacao import ModoPublicacao, Plataforma
from app.models import Base, Corte, MetadadoCorte, Projeto, Short
from app.services import publicacao_destinos as destinos
from app.services.publicacao_destinos import ContextoPublicacao, Destino
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


class _DestinoFalso(Destino):
    plataforma = Plataforma.TIKTOK
    modo = ModoPublicacao.MANUAL


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app.core import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    short_dir = tmp_path / "p1" / "cortes" / "c1" / "shorts" / "s1"
    short_dir.mkdir(parents=True)
    (short_dir / "short.mp4").write_bytes(b"video")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(destinos, "AsyncSessionLocal", factory)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="O corte",
                tema_central="Economia",
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                layout_youtube=json.dumps({}),
                youtube_url_publicado="https://youtu.be/longo",
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                titulo_sugerido="A conta que nao fecha",
                gancho="ninguem te conta isso",
                inicio_seg=10.0,
                fim_seg=50.0,
                arquivo_short_path="cortes/c1/shorts/s1/short.mp4",
            )
        )
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


@pytest.mark.asyncio
async def test_contexto_junta_arquivo_titulo_e_link_do_longo(ambiente):
    contexto = await destinos.montar_contexto("s1")

    assert contexto.arquivo.name == "short.mp4"
    assert contexto.duracao_seg == 40.0
    assert contexto.base.titulo == "A conta que nao fecha"
    assert contexto.base.url_video_longo == "https://youtu.be/longo"
    assert contexto.base.hashtags == ["Economia"]


@pytest.mark.asyncio
async def test_short_sem_render_nao_tem_o_que_publicar(ambiente):
    factory, _ = ambiente
    async with factory() as db:
        (await db.get(Short, "s1")).arquivo_short_path = ""
        await db.commit()

    with pytest.raises(ValueError, match="renderizado"):
        await destinos.montar_contexto("s1")


@pytest.mark.asyncio
async def test_arquivo_apagado_por_fora_tambem_recusa(ambiente):
    _, raiz = ambiente
    (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "short.mp4").unlink()

    with pytest.raises(ValueError, match="disco"):
        await destinos.montar_contexto("s1")


@pytest.mark.asyncio
async def test_preparar_e_comum_a_todos_os_destinos(ambiente):
    contexto = await destinos.montar_contexto("s1")

    pacote = await _DestinoFalso().preparar(contexto)

    assert pacote.plataforma is Plataforma.TIKTOK
    assert pacote.modo is ModoPublicacao.MANUAL
    assert "https://youtu.be/longo" in pacote.metadados.descricao
    assert pacote.avisos == []


@pytest.mark.asyncio
async def test_avisos_nao_bloqueiam_o_pacote(ambiente):
    """Reels longo demais ainda pode ser cortado e subido a mao — quem decide e o operador.

    D-584: eram 95s, que o teto de 90 reprovava. O teto subiu para 180 (o real),
    entao o caso do teste subiu junto — o que se testa aqui e que o AVISO nao
    bloqueia o pacote, e nao o numero em si.
    """
    contexto = await destinos.montar_contexto("s1")
    apertado = ContextoPublicacao(
        short_id=contexto.short_id,
        arquivo=contexto.arquivo,
        duracao_seg=200.0,
        vertical=True,
        base=contexto.base,
    )

    class _Reels(Destino):
        plataforma = Plataforma.INSTAGRAM_REELS

    pacote = await _Reels().preparar(apertado)

    assert pacote.avisos
    assert pacote.arquivo.exists()


@pytest.mark.asyncio
async def test_destino_sem_transporte_diz_isso_em_vez_de_falhar_torto(ambiente):
    contexto = await destinos.montar_contexto("s1")
    pacote = await _DestinoFalso().preparar(contexto)

    with pytest.raises(NotImplementedError, match="TikTok"):
        await _DestinoFalso().publicar(pacote)


def test_registro_devolve_os_destinos_na_ordem_das_plataformas(monkeypatch):
    monkeypatch.setattr(destinos, "_REGISTRO", {})
    destinos.registrar(_DestinoFalso())

    assert [d.plataforma for d in destinos.destinos_disponiveis()] == [Plataforma.TIKTOK]


def test_plataforma_sem_destino_registrado_levanta_lookup(monkeypatch):
    monkeypatch.setattr(destinos, "_REGISTRO", {})

    with pytest.raises(LookupError):
        destinos.obter_destino(Plataforma.YOUTUBE_SHORTS)


# ---------------------------------------------------------------------------
# D-535: de onde saem as hashtags, e por que nao do tema
# ---------------------------------------------------------------------------
#
# O sintoma foi um pacote com "#Ofetichedaderrotaearomantizacaodafraqueza": 50
# caracteres emendados que ninguem digita, ninguem clica e nenhuma pagina de
# hashtag indexa. A causa nao era o normalizador — era a FONTE. `tema_central` e
# uma frase editorial, escrita para o dev entender o corte, nao para ser um
# termo de busca.
#
# As `tags_youtube` do metadado sempre foram o que uma hashtag quer ser: termos
# curtos, escritos por quem conhece o assunto. Estavam ali, ignoradas.


@pytest_asyncio.fixture
async def com_metadado(ambiente):
    """O mesmo ambiente, com as tags curadas que o metadado ja guardava."""
    factory, raiz = ambiente
    async with factory() as db:
        db.add(
            MetadadoCorte(
                id="m1",
                corte_id="c1",
                tags_youtube=json.dumps(
                    ["banco master", "Daniel Vorcaro", "pix", "fgc fundo garantidor"]
                ),
            )
        )
        await db.commit()
    return factory, raiz


@pytest.mark.asyncio
async def test_as_hashtags_saem_das_tags_curadas(com_metadado):
    contexto = await destinos.montar_contexto("s1")

    assert contexto.base.hashtags[:3] == ["banco master", "Daniel Vorcaro", "pix"]


@pytest.mark.asyncio
async def test_o_tema_entra_depois_das_tags_e_nao_no_lugar_delas(com_metadado):
    """Reserva, e nao fonte: sem tag curada o tema ainda e melhor que nada."""
    contexto = await destinos.montar_contexto("s1")

    assert contexto.base.hashtags[-1] == "Economia"


@pytest.mark.asyncio
async def test_o_pacote_sai_com_termos_e_nao_com_a_frase(com_metadado):
    """O teste que descreve o defeito de ponta a ponta."""
    contexto = await destinos.montar_contexto("s1")

    pacote = await _DestinoFalso().preparar(contexto)

    assert pacote.metadados.hashtags == [
        "#bancomaster",
        "#danielvorcaro",
        "#pix",
        "#fgcfundogarantidor",
        "#economia",
    ]


@pytest.mark.asyncio
async def test_tema_longo_demais_nao_vira_hashtag(ambiente):
    """A frase editorial e descartada, e o pacote sai sem hashtag nenhuma.

    Sem hashtag e melhor que com a errada: a tag gigante nao traz alcance e
    ainda ocupa a legenda, que e onde o gancho deveria estar.
    """
    factory, _ = ambiente
    async with factory() as db:
        corte = await db.get(Corte, "c1")
        corte.tema_central = "O fetiche da derrota e a romantizacao da fraqueza"
        await db.commit()

    pacote = await _DestinoFalso().preparar(await destinos.montar_contexto("s1"))

    assert pacote.metadados.hashtags == []


@pytest.mark.asyncio
async def test_tags_corrompidas_nao_derrubam_o_pacote(ambiente):
    """JSON invalido na coluna vira zero tag, e nao um 500 na tela de publicar."""
    factory, _ = ambiente
    async with factory() as db:
        db.add(MetadadoCorte(id="m1", corte_id="c1", tags_youtube="{nao e json"))
        await db.commit()

    contexto = await destinos.montar_contexto("s1")

    assert contexto.base.hashtags == ["Economia"]


@pytest.mark.asyncio
async def test_o_corte_horizontal_usa_a_mesma_fonte(com_metadado, monkeypatch):
    """Dois construtores de contexto, uma regra so — senao divergem no proximo ajuste."""
    factory, raiz = com_metadado
    monkeypatch.setattr(destinos, "projetos_dir", lambda: raiz)
    pasta = raiz / "p1" / "cortes" / "c1" / "upload_ready"
    pasta.mkdir(parents=True)
    (pasta / "video.mp4").write_bytes(b"video")

    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.base.hashtags[:2] == ["banco master", "Daniel Vorcaro"]

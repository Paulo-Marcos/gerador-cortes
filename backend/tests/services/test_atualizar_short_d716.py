"""Cada decisão que o PATCH do short grava (D-716).

Teste de caracterização, antes de fatiar `atualizar_short` (complexidade 36). A
suíte cobria os caminhos principais e deixava 38 ramos sem teste — o gancho, a
legenda, o palco, a marca do preset e as recusas. Aqui cada grupo fixa o que a
função grava. Os valores normalizados são conferidos contra os MESMOS
normalizadores do domínio: o teste prende que o service os aplica, não a regra
deles.
"""

import json

import pytest
import pytest_asyncio
from app.domain.short import gancho_short, legenda_short
from app.models import Base, Corte, Projeto, Short
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def atualizar(short_id: str, **campos):
    return servico.atualizar_short(short_id, servico.AtualizarShortDTO(**campos))


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=300.0,
                duracao_clip_seg=300.0,
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=30.0,
                fim_seg=70.0,
                palco_short_preset="preset-x",
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


async def _short(fabrica) -> Short:
    async with fabrica() as db:
        return await db.get(Short, "s1")


# ─── Recusas ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("campos", "trecho"),
    [
        ({"status": "renderizado"}, "decisao de curadoria"),
        ({"foco_x": 1.5}, "foco horizontal"),
        ({"moldura": "neon"}, "Moldura"),
        ({"arranjo_palco": "nao-existe"}, "Arranjo"),
    ],
)
@pytest.mark.asyncio
async def test_valor_fora_do_permitido_e_recusado(fabrica, campos, trecho):
    with pytest.raises(ValueError, match=trecho):
        await atualizar("s1", **campos)


@pytest.mark.asyncio
async def test_short_inexistente(fabrica):
    with pytest.raises(LookupError):
        await atualizar("nao-tem", foco_x=0.5)


@pytest.mark.asyncio
async def test_short_de_segmentos_nao_aceita_arrastar_a_borda(fabrica):
    await atualizar(
        "s1",
        segmentos=[{"inicio_seg": 10, "fim_seg": 20}, {"inicio_seg": 40, "fim_seg": 50}],
    )

    with pytest.raises(ValueError, match="montado por segmentos"):
        await atualizar("s1", inicio_seg=12.0)


@pytest.mark.asyncio
async def test_segmento_fora_do_bruto_e_recusado_e_nao_encolhe(fabrica):
    with pytest.raises(ValueError):
        await atualizar("s1", segmentos=[{"inicio_seg": 500, "fim_seg": 520}])


# ─── Segmentos ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dois_segmentos_gravam_a_colagem_e_o_envelope(fabrica):
    await atualizar(
        "s1",
        segmentos=[{"inicio_seg": 10, "fim_seg": 20}, {"inicio_seg": 40, "fim_seg": 50}],
    )

    short = await _short(fabrica)
    assert [s["inicio_seg"] for s in json.loads(short.segmentos)] == [10.0, 40.0]
    assert (short.inicio_seg, short.fim_seg) == (10.0, 50.0)


@pytest.mark.asyncio
async def test_um_segmento_so_e_janela_unica_com_as_bordas_dele(fabrica):
    await atualizar("s1", segmentos=[{"inicio_seg": 12, "fim_seg": 22}])

    short = await _short(fabrica)
    assert (short.segmentos, short.inicio_seg, short.fim_seg) == ("[]", 12.0, 22.0)


@pytest.mark.asyncio
async def test_lista_vazia_desfaz_a_colagem(fabrica):
    await atualizar(
        "s1",
        segmentos=[{"inicio_seg": 10, "fim_seg": 20}, {"inicio_seg": 40, "fim_seg": 50}],
    )
    await atualizar("s1", segmentos=[])

    assert (await _short(fabrica)).segmentos == "[]"


# ─── Foco, gancho e legenda ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_foco_arredonda_em_tres_casas(fabrica):
    await atualizar("s1", foco_x=0.12345)

    assert (await _short(fabrica)).foco_x == 0.123


@pytest.mark.asyncio
async def test_o_gancho_grava_normalizado(fabrica):
    await atualizar(
        "s1",
        gancho_tela="  o que ninguém te conta sobre isso  ",
        gancho_ate_seg=3.7,
        gancho_cor="#FFCC00",
        gancho_realce="veu",
        gancho_x=0.3,
        gancho_y=0.2,
        gancho_largura=0.8,
    )

    short = await _short(fabrica)
    assert short.gancho_tela == gancho_short.normalizar_gancho(
        "  o que ninguém te conta sobre isso  "
    )
    assert short.gancho_ate_seg == gancho_short.normalizar_duracao(3.7)
    assert short.gancho_cor == gancho_short.normalizar_cor("#FFCC00")
    assert short.gancho_realce == gancho_short.normalizar_realce("veu")
    assert (short.gancho_x, short.gancho_y, short.gancho_largura) == (
        gancho_short.normalizar_x(0.3),
        gancho_short.normalizar_y(0.2),
        gancho_short.normalizar_largura(0.8),
    )


@pytest.mark.asyncio
async def test_zero_e_vazio_no_gancho_voltam_a_herdar(fabrica):
    await atualizar("s1", gancho_ate_seg=3.0, gancho_realce="veu", gancho_x=0.3)
    await atualizar(
        "s1", gancho_ate_seg=0, gancho_realce="  ", gancho_x=0, gancho_y=0, gancho_largura=0
    )

    short = await _short(fabrica)
    assert (short.gancho_ate_seg, short.gancho_realce) == (0.0, "")
    assert (short.gancho_x, short.gancho_y, short.gancho_largura) == (0.0, 0.0, 0.0)


@pytest.mark.asyncio
async def test_a_legenda_grava_normalizada_e_zero_volta_a_herdar(fabrica):
    await atualizar(
        "s1",
        legenda_cor="#00FF00",
        legenda_fonte="Inter",
        legenda_x=0.4,
        legenda_y=0.7,
        legenda_largura=0.9,
    )
    short = await _short(fabrica)
    assert (short.legenda_cor, short.legenda_fonte) == ("#00FF00", "Inter")
    assert (short.legenda_x, short.legenda_y, short.legenda_largura) == (
        legenda_short.normalizar_x(0.4),
        legenda_short.normalizar_y(0.7),
        legenda_short.normalizar_largura(0.9),
    )

    await atualizar("s1", legenda_x=0, legenda_y=0, legenda_largura=0)

    short = await _short(fabrica)
    assert (short.legenda_x, short.legenda_y, short.legenda_largura) == (0.0, 0.0, 0.0)


# ─── Palco ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_o_palco_grava_cada_escolha(fabrica):
    await atualizar(
        "s1",
        moldura="palco",
        palco_preset="preset-do-corte",
        fundo_palco="acento",
        fundo_editorial="papel",
        arranjo_palco="dividida_empilhada",
        janela_cheia="tela",
    )

    short = await _short(fabrica)
    assert (short.moldura, short.palco_preset) == ("palco", "preset-do-corte")
    assert (short.fundo_palco, short.fundo_editorial) == ("acento", "papel")
    assert (short.arranjo_palco, short.janela_cheia) == ("dividida_empilhada", "tela")


@pytest.mark.asyncio
async def test_ajustes_e_recortes_guardam_so_os_retangulos_completos(fabrica):
    completo = {"x": 1, "y": 2, "w": 3, "h": 4}
    await atualizar(
        "s1",
        ajustes_palco={"tela": completo, "rosto": {"x": 1}, "lixo": "nao"},
        recortes_palco={"tela": completo, "rosto": {"y": 1, "w": 2}},
    )

    short = await _short(fabrica)
    esperado = {"tela": {"x": 1.0, "y": 2.0, "w": 3.0, "h": 4.0}}
    assert json.loads(short.ajustes_palco) == esperado
    assert json.loads(short.recortes_palco) == esperado


@pytest.mark.asyncio
async def test_arranjo_vazio_volta_ao_automatico(fabrica):
    await atualizar("s1", arranjo_palco="dividida_empilhada")
    await atualizar("s1", arranjo_palco="")

    assert (await _short(fabrica)).arranjo_palco == ""


# ─── A marca do preset do palco (D-552) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_aplicar_um_preset_grava_a_marca(fabrica):
    await atualizar("s1", palco_short_preset="preset-y", arranjo_palco="cheia")

    assert (await _short(fabrica)).palco_short_preset == "preset-y"


@pytest.mark.parametrize(
    "campos",
    [
        {"arranjo_palco": "cheia"},
        {"janela_cheia": "tela"},
        {"recortes_palco": {}},
        {"fundo_editorial": "papel"},
        {"legenda_cor": "#fff"},
        {"legenda_fonte": "Inter"},
        {"legenda_x": 0.5},
        {"legenda_y": 0.5},
        {"legenda_largura": 0.5},
    ],
)
@pytest.mark.asyncio
async def test_mexer_no_palco_depois_apaga_a_marca(fabrica, campos):
    await atualizar("s1", **campos)

    assert (await _short(fabrica)).palco_short_preset == ""


@pytest.mark.asyncio
async def test_mexer_fora_do_palco_mantem_a_marca(fabrica):
    await atualizar("s1", foco_x=0.5, gancho_tela="gancho qualquer para testar", moldura="palco")

    assert (await _short(fabrica)).palco_short_preset == "preset-x"

"""A impressão digital do bundle não precisa ser refeita a cada render (D-648).

Ela relê 165 MB (src + public + theme) e custa ~2,8s com o disco frio, dentro do
event loop. O cache separa duas perguntas: "mudou alguma coisa?" (barato: nome,
tamanho e data) e "qual é o hash?" (caro: o conteúdo).

O que estes testes protegem é o medo certo: um cache que erra aqui NÃO dá erro —
ele reaproveita um bundle com o mascote ou o tema do canal ANTERIOR, e a maioria
dos overlays some do vídeo (a regressão do D-190).
"""

import threading

import pytest
from app.infrastructure.render.remotion_bundle import compute_src_fingerprint
from app.services import pipeline_render_helpers as helpers


@pytest.fixture(autouse=True)
def cache_limpo():
    helpers.esquecer_fingerprint_em_cache()
    yield
    helpers.esquecer_fingerprint_em_cache()


@pytest.fixture
def renderer(tmp_path):
    """Um `video-renderer` de mentira, com as quatro fontes do fingerprint."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "Root.tsx").write_text("export const Root = 1;", encoding="utf-8")
    (tmp_path / "public" / "mascote").mkdir(parents=True)
    (tmp_path / "public" / "mascote" / "feliz.png").write_bytes(b"pose-original")
    (tmp_path / "theme.config.json").write_text('{"cor": "azul"}', encoding="utf-8")
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "remotion.config.ts").write_text("// config", encoding="utf-8")
    return tmp_path


def test_valor_e_o_mesmo_de_antes(renderer):
    """Não-regressão: o cache não pode inventar um fingerprint novo."""
    esperado = compute_src_fingerprint(
        renderer / "src", extra_files=helpers._extras_do_fingerprint(renderer)
    )

    assert helpers.fingerprint_do_bundle(renderer) == esperado


def test_segunda_chamada_nao_rele_o_conteudo(renderer, monkeypatch):
    calculos = []
    original = helpers.compute_src_fingerprint

    def contando(*args, **kwargs):
        calculos.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(helpers, "compute_src_fingerprint", contando)

    primeiro = helpers.fingerprint_do_bundle(renderer)
    segundo = helpers.fingerprint_do_bundle(renderer)

    assert primeiro == segundo
    assert len(calculos) == 1, "o conteúdo foi relido sem nada ter mudado"


def test_trocar_o_mascote_invalida(renderer):
    """A regressão do D-190: cache-hit com o mascote antigo apaga os overlays."""
    antes = helpers.fingerprint_do_bundle(renderer)

    (renderer / "public" / "mascote" / "feliz.png").write_bytes(b"pose-de-outro-canal")

    assert helpers.fingerprint_do_bundle(renderer) != antes


def test_trocar_o_tema_invalida(renderer):
    antes = helpers.fingerprint_do_bundle(renderer)

    (renderer / "theme.config.json").write_text('{"cor": "verde"}', encoding="utf-8")

    assert helpers.fingerprint_do_bundle(renderer) != antes


def test_editar_o_codigo_do_renderer_invalida(renderer):
    antes = helpers.fingerprint_do_bundle(renderer)

    (renderer / "src" / "Root.tsx").write_text("export const Root = 2;", encoding="utf-8")

    assert helpers.fingerprint_do_bundle(renderer) != antes


def test_arquivo_novo_no_public_invalida(renderer):
    antes = helpers.fingerprint_do_bundle(renderer)

    (renderer / "public" / "mascote" / "triste.png").write_bytes(b"pose-nova")

    assert helpers.fingerprint_do_bundle(renderer) != antes


def test_subir_o_remotion_no_lockfile_invalida(renderer):
    """D-643: `npm install` que troca a versão resolvida não mexe no package.json.

    Com `^4.0.502` declarado, o que muda é só o `package-lock.json` — e o bundle
    velho continuaria rodando com o CLI e o renderer novos.
    """
    (renderer / "package-lock.json").write_text('{"remotion": "4.0.502"}', encoding="utf-8")
    antes = helpers.fingerprint_do_bundle(renderer)

    (renderer / "package-lock.json").write_text('{"remotion": "4.0.503"}', encoding="utf-8")

    assert helpers.fingerprint_do_bundle(renderer) != antes


def test_instalacao_sem_lockfile_continua_funcionando(renderer):
    """Quem instalar sem lockfile não pode ficar sem fingerprint."""
    assert not (renderer / "package-lock.json").exists()

    assert len(helpers.fingerprint_do_bundle(renderer)) == 64


@pytest.mark.asyncio
async def test_versao_async_nao_le_disco_no_event_loop(renderer, monkeypatch):
    def na_thread(*args, **kwargs):
        assert threading.current_thread() is not threading.main_thread(), (
            "a leitura do bundle voltou para o event loop"
        )
        return "fingerprint-de-mentira"

    monkeypatch.setattr(helpers, "fingerprint_do_bundle", na_thread)

    assert await helpers.fingerprint_do_bundle_async(renderer) == "fingerprint-de-mentira"

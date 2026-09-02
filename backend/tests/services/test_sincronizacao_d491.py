"""D-491: tornar visivel a diferenca entre o que roda e o que esta no disco.

Quatro vezes numa sessao so, um bug foi cacado onde ele nao estava: backend
anterior ao codigo, npm install faltando, coluna que so nasce no boot, e um
palpite errado meu sobre o PROD estar atrasado.

O que estes testes protegem, alem do obvio: que NAO SABER nao vire alarme.
Git indisponivel, node_modules ausente, tabela que ainda nao existe — nenhum
desses e uma dessincronizacao, e avisar sobre eles ensinaria o operador a
ignorar o aviso que importa.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base
from app.services import sincronizacao as servico
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def conexao():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with engine.connect() as conn:
        yield conn
    await engine.dispose()


class TestColunasPendentes:
    @pytest.mark.asyncio
    async def test_banco_no_esquema_atual_nao_tem_pendencia(self, conexao):
        assert await servico.colunas_pendentes(conexao) == []

    @pytest.mark.asyncio
    async def test_coluna_que_o_modelo_declara_e_o_banco_nao_tem_aparece(self, conexao):
        """O caso real: `origem` e `palco_short_preset` nasceram assim."""
        await conexao.execute(text("ALTER TABLE shorts DROP COLUMN origem"))

        pendentes = await servico.colunas_pendentes(conexao)

        assert "shorts.origem" in pendentes

    @pytest.mark.asyncio
    async def test_tabela_ausente_nao_vira_pendencia(self, conexao):
        """Nao saber != estar errado.

        Uma tabela que o modelo declara e o banco nao tem e assunto da
        reconciliacao no boot, nao deste aviso — e listar cada coluna dela
        afogaria o que o operador precisa ler.
        """
        await conexao.execute(text("DROP TABLE shorts"))

        pendentes = await servico.colunas_pendentes(conexao)

        assert not any(p.startswith("shorts.") for p in pendentes)

    @pytest.mark.asyncio
    async def test_usa_a_mesma_conta_da_reconciliacao(self):
        """Duas versoes discordariam, e a que mente e a que o operador le."""
        import inspect

        from app.migrations import reconciliacao

        assert reconciliacao.colunas_faltantes.__code__ is servico.colunas_faltantes.__code__
        assert "colunas_faltantes" in inspect.getsource(servico.colunas_pendentes)


class TestDependencias:
    def test_dependencia_declarada_e_nao_instalada_aparece(self, tmp_path, monkeypatch):
        """O caso do @remotion/captions: o import quebrava sem dizer o motivo."""
        frontend = tmp_path / "frontend"
        (frontend / "node_modules" / "react").mkdir(parents=True)
        (frontend / "package.json").write_text(
            json.dumps({"dependencies": {"react": "^18", "@remotion/captions": "^4"}}),
            encoding="utf-8",
        )
        monkeypatch.setattr(servico, "_RAIZ", tmp_path)

        assert servico.dependencias_faltando() == ["@remotion/captions"]

    def test_devdependencies_ficam_de_fora(self, tmp_path, monkeypatch):
        """Nao derrubam a tela do operador; listadas, virariam ruido."""
        frontend = tmp_path / "frontend"
        (frontend / "node_modules").mkdir(parents=True)
        (frontend / "package.json").write_text(
            json.dumps({"dependencies": {}, "devDependencies": {"vitest": "^4"}}),
            encoding="utf-8",
        )
        monkeypatch.setattr(servico, "_RAIZ", tmp_path)

        assert servico.dependencias_faltando() == []

    def test_sem_node_modules_nao_acusa_tudo_faltando(self, tmp_path, monkeypatch):
        """Checkout sem instalar ainda nao e dessincronizacao — e um checkout novo."""
        frontend = tmp_path / "frontend"
        frontend.mkdir(parents=True)
        (frontend / "package.json").write_text(
            json.dumps({"dependencies": {"react": "^18"}}), encoding="utf-8"
        )
        monkeypatch.setattr(servico, "_RAIZ", tmp_path)

        assert servico.dependencias_faltando() == []

    def test_package_json_corrompido_nao_derruba_o_check(self, tmp_path, monkeypatch):
        frontend = tmp_path / "frontend"
        (frontend / "node_modules").mkdir(parents=True)
        (frontend / "package.json").write_text("{ nao e json", encoding="utf-8")
        monkeypatch.setattr(servico, "_RAIZ", tmp_path)

        assert servico.dependencias_faltando() == []


class TestEstado:
    @pytest.mark.asyncio
    async def test_tudo_igual_da_em_dia(self, conexao, monkeypatch):
        monkeypatch.setattr(servico, "_commit_do_disco", lambda: "abc1234")
        monkeypatch.setattr(servico, "commit_do_processo", lambda: "abc1234")
        monkeypatch.setattr(servico, "dependencias_faltando", list)

        assert (await servico.estado(conexao))["em_dia"] is True

    @pytest.mark.asyncio
    async def test_commit_diferente_acusa_backend_velho(self, conexao, monkeypatch):
        """O caso da D-473: o processo no ar carregou codigo de antes do pull."""
        monkeypatch.setattr(servico, "commit_do_processo", lambda: "aaaaaaa")
        monkeypatch.setattr(servico, "_commit_do_disco", lambda: "bbbbbbb")
        monkeypatch.setattr(servico, "dependencias_faltando", list)

        estado = await servico.estado(conexao)

        assert estado["backend_velho"] is True
        assert estado["em_dia"] is False

    @pytest.mark.asyncio
    async def test_git_indisponivel_nao_vira_alarme(self, conexao, monkeypatch):
        """Aviso falso ensina a ignorar o aviso verdadeiro."""
        monkeypatch.setattr(servico, "commit_do_processo", lambda: "")
        monkeypatch.setattr(servico, "_commit_do_disco", lambda: "")
        monkeypatch.setattr(servico, "dependencias_faltando", list)

        estado = await servico.estado(conexao)

        assert estado["backend_velho"] is False
        assert estado["em_dia"] is True

    @pytest.mark.asyncio
    async def test_o_veredito_vem_pronto_do_backend(self, conexao, monkeypatch):
        """Uma tela que monta o proprio veredito pode discordar de outra."""
        monkeypatch.setattr(servico, "commit_do_processo", lambda: "aaa")
        monkeypatch.setattr(servico, "_commit_do_disco", lambda: "aaa")
        monkeypatch.setattr(servico, "dependencias_faltando", lambda: ["@remotion/captions"])

        estado = await servico.estado(conexao)

        assert estado["em_dia"] is False, "dependencia faltando tem de derrubar o em_dia"

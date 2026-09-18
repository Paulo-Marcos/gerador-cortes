"""Itens de baixo impacto — os que a medição mostrou que se pagam (D-656).

Cada um foi medido antes de mexer:
  - `git rev-parse` do aviso de sincronia: 43 ms, dentro do event loop;
  - abrir o banco de settings com o DDL: 2,18 ms por conexão;
  - fila do WebSocket: uma só por projeto, disputada por todas as abas.

Dois itens ficaram de fora depois de medidos: o `LIKE` da fila de jobs (3 ms,
fora do loop, num scan de 824 linhas) e o cache do ponteiro do canal (o ganho
de 0,15 ms não paga o risco de devolver o canal errado — ver a classe abaixo).
"""

import asyncio
import sqlite3
import threading

import pytest
from app import channel_paths
from app.services import settings_store, sincronizacao
from app.services.ingestao import _CanalDeProgresso


class TestCanalDeProgresso:
    """Duas abas no mesmo download: as duas veem TODAS as atualizações."""

    @pytest.mark.asyncio
    async def test_cada_aba_recebe_tudo(self):
        canal = _CanalDeProgresso()
        aba1, aba2 = canal.inscrever(), canal.inscrever()

        await canal.put({"status": "baixando", "progresso": 10.0})
        await canal.put({"status": "baixando", "progresso": 20.0})

        assert [aba1.get_nowait()["progresso"], aba1.get_nowait()["progresso"]] == [10.0, 20.0]
        assert [aba2.get_nowait()["progresso"], aba2.get_nowait()["progresso"]] == [10.0, 20.0]

    @pytest.mark.asyncio
    async def test_quem_chega_no_meio_ve_o_estado_atual(self):
        canal = _CanalDeProgresso()
        await canal.put({"status": "baixando", "progresso": 42.0})

        atrasada = canal.inscrever()

        assert atrasada.get_nowait()["progresso"] == 42.0

    @pytest.mark.asyncio
    async def test_aba_fechada_nao_deixa_fila_orfa_recebendo(self):
        canal = _CanalDeProgresso()
        fila = canal.inscrever()
        canal.cancelar_inscricao(fila)

        await canal.put({"status": "baixando", "progresso": 50.0})

        assert fila.empty()


class TestSchemaDeSettings:
    def test_o_ddl_roda_uma_vez_por_banco_e_nao_a_cada_conexao(self, tmp_path, monkeypatch):
        settings_store.esquecer_schema_garantido()
        db = tmp_path / "settings.db"
        vezes = []
        original = settings_store._garantir_schema

        def contando(conn, chave):
            vezes.append(chave)
            return original(conn, chave)

        monkeypatch.setattr(settings_store, "_garantir_schema", contando)

        for _ in range(5):
            settings_store._connect(db).close()

        assert len(vezes) == 1, f"o DDL rodou {len(vezes)} vezes"

    def test_banco_novo_continua_nascendo_com_as_tabelas(self, tmp_path):
        """A garantia que importa: primeiro boot / split PROD-DEV."""
        settings_store.esquecer_schema_garantido()
        db = tmp_path / "novo.db"

        settings_store.inicializar(db)

        conn = sqlite3.connect(db)
        tabelas = {t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
        assert tabelas, "o banco novo saiu vazio"


class TestPonteiroDoCanal:
    """A otimização que NÃO entrou — e o guarda para ninguém tentar de novo às cegas.

    Um cache com invalidação por data+tamanho parecia óbvio (0,18 ms viram 0,008).
    Mas no Windows duas escritas seguidas do ponteiro saem com o MESMO mtime_ns e
    o MESMO tamanho, então o cache devolveria o canal ANTIGO — e é este ponteiro
    que decide em qual banco o app escreve.
    """

    def test_troca_imediata_do_ponteiro_e_enxergada(self, tmp_path):
        ponteiro = tmp_path / "active-channel"
        ponteiro.write_text("canal-a", encoding="utf-8")
        assert channel_paths._ler_canal_ativo(tmp_path) == "canal-a"

        ponteiro.write_text("canal-b", encoding="utf-8")

        assert channel_paths._ler_canal_ativo(tmp_path) == "canal-b", (
            "leitura do canal ativo não pode depender de cache por data/tamanho"
        )

    def test_sem_ponteiro_devolve_vazio(self, tmp_path):
        assert channel_paths._ler_canal_ativo(tmp_path) == ""


@pytest.mark.asyncio
async def test_git_rev_parse_nao_roda_no_event_loop(monkeypatch):
    """43 ms de congelamento por poll — fora do laço, como a D-645 fez com o resto."""

    def na_thread():
        assert threading.current_thread() is not threading.main_thread(), (
            "o `git rev-parse` voltou para o event loop"
        )
        return "abc1234"

    monkeypatch.setattr(sincronizacao, "_commit_do_disco", na_thread)
    monkeypatch.setattr(sincronizacao, "commit_do_processo", lambda: "abc1234")
    monkeypatch.setattr(sincronizacao, "dependencias_faltando", list)
    monkeypatch.setattr(sincronizacao, "canal_do_processo", lambda: "c")
    monkeypatch.setattr(sincronizacao, "canal_no_disco", lambda: "c")
    monkeypatch.setattr(sincronizacao, "colunas_pendentes", _sem_colunas_pendentes)

    estado = await sincronizacao.estado(conn=None)

    assert estado["em_dia"] is True


async def _sem_colunas_pendentes(_conn):
    await asyncio.sleep(0)
    return []

import pytest
from app.core.tarefas_ativas import (
    RETENCAO_SEG,
    TIPO_DESCONHECIDO,
    TarefasAtivas,
    classificar_background,
    classificar_ia,
)


@pytest.fixture(autouse=True)
def _registro_limpo():
    TarefasAtivas.limpar()
    yield
    TarefasAtivas.limpar()


class TestClassificarIa:
    def test_skill_conhecida_vira_tipo_e_rotulo(self):
        assert classificar_ia("cortador-expert") == ("analise", "Analisando transcrição")
        assert classificar_ia("cenas-expert") == ("cenas", "Gerando cenas")

    def test_skill_nova_nao_some_da_fila(self):
        """Etapa desconhecida cai no genérico — skill nova aparece sem registro."""
        assert classificar_ia("skill-que-ainda-nao-existe") == TIPO_DESCONHECIDO

    def test_sem_etapa_tambem_cai_no_generico(self):
        assert classificar_ia(None) == TIPO_DESCONHECIDO


class TestClassificarBackground:
    def test_extrai_tipo_escopo_e_prefixo_do_id(self):
        assert classificar_background("metadados-abc12345") == (
            "metadados",
            "corte",
            "Gerando metadados",
            "abc12345",
        )

    def test_prefixo_mais_especifico_vence(self):
        """`ingestao-retry-` não pode ser engolido por `ingestao-`."""
        tipo, escopo, _, prefixo = classificar_background("ingestao-retry-abc12345")
        assert (tipo, escopo, prefixo) == ("ingestao", "projeto", "abc12345")

    @pytest.mark.parametrize(
        "nome",
        [
            "render-final-abc12345",  # já tem RenderProgressStore
            "gerar-bruto-abc12345",  # já tem BrutoProgress
            "processar-todos-abc12345",  # já tem _fila_processamento
            "yt-upload-abc12345",  # já tem _fila_youtube
            "grade_abc",  # sub-fase do render final
            "youtube-stats-sync",  # não é IA nem mídia
            None,
        ],
    )
    def test_tarefas_fora_da_fila(self, nome):
        assert classificar_background(nome) is None


class TestRegistro:
    def test_iniciar_e_encerrar_com_sucesso(self):
        TarefasAtivas.iniciar(
            "ia:cortador-expert:p1", tipo="analise", etapa="Analisando", projeto_id="p1"
        )
        assert [t.estado for t in TarefasAtivas.listar()] == ["rodando"]

        TarefasAtivas.encerrar("ia:cortador-expert:p1", sucesso=True)

        tarefa = TarefasAtivas.listar()[0]
        assert tarefa.estado == "concluido"
        assert tarefa.erro == ""
        assert not tarefa.ativa

    def test_encerrar_com_falha_guarda_a_mensagem(self):
        TarefasAtivas.iniciar(
            "ia:cenas-expert:c1", tipo="cenas", etapa="Gerando cenas", corte_id="c1"
        )

        TarefasAtivas.encerrar("ia:cenas-expert:c1", sucesso=False, erro="timeout do Claude CLI")

        tarefa = TarefasAtivas.listar()[0]
        assert tarefa.estado == "erro"
        assert tarefa.erro == "timeout do Claude CLI"

    def test_encerrar_tarefa_desconhecida_e_no_op(self):
        TarefasAtivas.encerrar("ia:inexistente:c1", sucesso=True)

        assert TarefasAtivas.listar() == []

    def test_rodar_de_novo_substitui_o_item_em_vez_de_empilhar(self):
        TarefasAtivas.iniciar(
            "ia:cenas-expert:c1", tipo="cenas", etapa="Gerando cenas", corte_id="c1"
        )
        TarefasAtivas.encerrar("ia:cenas-expert:c1", sucesso=False, erro="falhou")

        TarefasAtivas.iniciar(
            "ia:cenas-expert:c1", tipo="cenas", etapa="Gerando cenas", corte_id="c1"
        )

        assert [t.estado for t in TarefasAtivas.listar()] == ["rodando"]

    def test_terminal_antigo_e_descartado_mas_ativo_permanece(self, monkeypatch):
        TarefasAtivas.iniciar("ia:velha:c1", tipo="cenas", etapa="Gerando cenas", corte_id="c1")
        TarefasAtivas.encerrar("ia:velha:c1", sucesso=True)
        TarefasAtivas.iniciar("ia:ativa:c2", tipo="cenas", etapa="Gerando cenas", corte_id="c2")

        agora_real = __import__("time").time()
        monkeypatch.setattr(
            "app.core.tarefas_ativas.time.time", lambda: agora_real + RETENCAO_SEG + 1
        )

        assert [t.chave for t in TarefasAtivas.listar()] == ["ia:ativa:c2"]

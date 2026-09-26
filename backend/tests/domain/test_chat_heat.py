import json

from app.domain.projeto.chat_heat import (
    PicoChat,
    formatar_dica,
    parse_live_chat,
    picos_no_intervalo,
    picos_significativos,
)


def _linha(offset_ms, texto="oi", pago=False):
    render = "liveChatPaidMessageRenderer" if pago else "liveChatTextMessageRenderer"
    return json.dumps(
        {
            "replayChatItemAction": {
                "videoOffsetTimeMsec": str(offset_ms),
                "actions": [
                    {
                        "addChatItemAction": {
                            "item": {render: {"message": {"runs": [{"text": texto}]}}}
                        }
                    }
                ],
            }
        }
    )


class TestParseLiveChat:
    def test_extrai_instantes_em_segundos(self):
        conteudo = "\n".join([_linha(0), _linha(90_000), _linha(1_500)])
        assert parse_live_chat(conteudo) == [0.0, 1.5, 90.0]

    def test_ignora_linha_corrompida_sem_derrubar_o_resto(self):
        # O arquivo vem do YouTube: uma linha quebrada não pode zerar a análise.
        conteudo = "\n".join([_linha(1_000), "{isso nao e json", _linha(2_000)])
        assert parse_live_chat(conteudo) == [1.0, 2.0]

    def test_ignora_eventos_que_nao_sao_mensagem(self):
        entrou = json.dumps(
            {
                "replayChatItemAction": {
                    "videoOffsetTimeMsec": "5000",
                    "actions": [
                        {
                            "addChatItemAction": {
                                "item": {"liveChatViewerEngagementMessageRenderer": {}}
                            }
                        }
                    ],
                }
            }
        )
        assert parse_live_chat("\n".join([entrou, _linha(7_000)])) == [7.0]

    def test_super_chat_conta_como_mensagem(self):
        assert parse_live_chat(_linha(3_000, pago=True)) == [3.0]

    def test_conteudo_vazio(self):
        assert parse_live_chat("") == []


class TestPicosSignificativos:
    def test_chat_uniforme_nao_gera_pico(self):
        # 600 mensagens espalhadas por igual em 1h: não há o que destacar.
        instantes = [i * 6.0 for i in range(600)]
        assert picos_significativos(instantes, 3600.0) == []

    def test_rajada_concentrada_vira_pico(self):
        base = [i * 12.0 for i in range(300)]  # fundo uniforme em 1h
        rajada = [1800.0 + i * 0.5 for i in range(60)]  # 60 msg em 30s
        picos = picos_significativos(sorted(base + rajada), 3600.0)
        assert len(picos) == 1
        assert picos[0].inicio_seg == 1800.0
        assert picos[0].mensagens > picos[0].esperado

    def test_pilha_de_pre_transmissao_nao_vira_pico(self):
        # Todo mundo que chega antes do "ar" recebe offset 0 — é fila de
        # chegada, não reação. Sem o filtro, essa pilha era o maior pico.
        base = [60.0 + i * 12.0 for i in range(300)]
        chegada = [0.0] * 80
        picos = picos_significativos(sorted(chegada + base), 3600.0)
        assert all(p.inicio_seg > 0 for p in picos)

    def test_live_silenciosa_nao_gera_pico(self):
        # Piso absoluto: 5 mensagens juntas numa live morta não é evento.
        assert picos_significativos([100.0, 101.0, 102.0, 103.0, 104.0], 3600.0) == []

    def test_sem_mensagens(self):
        assert picos_significativos([], 3600.0) == []

    def test_duracao_invalida(self):
        assert picos_significativos([1.0, 2.0], 0) == []

    def test_live_curta_demais_para_comparar(self):
        # Com uma janela só não existe "acima da média" — não há média.
        assert picos_significativos([10.0] * 50, 120.0) == []

    def test_picos_saem_do_maior_para_o_menor(self):
        base = [i * 12.0 for i in range(300)]
        forte = [900.0 + i * 0.3 for i in range(70)]
        fraca = [2700.0 + i * 2.0 for i in range(40)]
        picos = picos_significativos(sorted(base + forte + fraca), 3600.0)
        assert len(picos) >= 2
        assert picos[0].mensagens >= picos[1].mensagens


class TestFormatarDica:
    def test_sem_picos_devolve_vazio(self):
        # Metade das lives não tem pico: o prompt não pode ganhar cabeçalho vazio.
        assert formatar_dica([]) == ""

    def test_cita_horario_e_contagem(self):
        dica = formatar_dica([PicoChat(6120.0, 6300.0, 38, 13.1, 1e-6)])
        assert "01:42:00" in dica
        assert "38 mensagens" in dica

    def test_enquadra_como_pista_e_nao_como_ordem(self):
        dica = formatar_dica([PicoChat(60.0, 240.0, 30, 10.0, 1e-4)])
        assert "pista" in dica.lower()

    def test_respeita_o_limite(self):
        picos = [PicoChat(i * 200.0, i * 200.0 + 180, 30 - i, 10.0, 1e-4) for i in range(6)]
        assert formatar_dica(picos, limite=2).count("\n- ") == 2


class TestPicosNoIntervalo:
    def test_filtra_para_a_janela_da_parte(self):
        picos = [PicoChat(100.0, 280.0, 20, 5.0, 1e-4), PicoChat(3000.0, 3180.0, 20, 5.0, 1e-4)]
        assert picos_no_intervalo(picos, 0.0, 1000.0) == [picos[0]]

    def test_inclui_pico_que_cruza_a_borda(self):
        pico = PicoChat(900.0, 1080.0, 20, 5.0, 1e-4)
        assert picos_no_intervalo([pico], 1000.0, 2000.0) == [pico]

    def test_intervalo_sem_pico(self):
        pico = PicoChat(100.0, 280.0, 20, 5.0, 1e-4)
        assert picos_no_intervalo([pico], 1000.0, 2000.0) == []

"""Parser das mensagens do chat com autor e texto (D-910)."""

import json

from app.domain.projeto.chat_heat import parse_live_chat
from app.domain.projeto.chat_mensagens import parse_mensagens_do_chat, texto_da_mensagem


def _linha(offset_ms, runs, autor="@Fulano", renderer="liveChatTextMessageRenderer", fotos=None):
    item = {
        renderer: {
            "message": {"runs": runs},
            "authorName": {"simpleText": autor},
            "authorPhoto": {"thumbnails": fotos or []},
        }
    }
    return json.dumps(
        {
            "replayChatItemAction": {
                "actions": [{"addChatItemAction": {"item": item}}],
                "videoOffsetTimeMsec": str(offset_ms),
            }
        }
    )


def test_le_instante_autor_texto_e_a_maior_foto():
    fotos = [
        {"url": "https://yt/s32", "width": 32, "height": 32},
        {"url": "https://yt/s64", "width": 64, "height": 64},
    ]
    conteudo = _linha(2830500, [{"text": "a rede vai entregar conteúdo?"}], fotos=fotos)

    [msg] = parse_mensagens_do_chat(conteudo)

    assert msg.instante_seg == 2830.5
    assert msg.autor == "@Fulano"
    assert msg.texto == "a rede vai entregar conteúdo?"
    assert msg.foto_url == "https://yt/s64"


def test_superchat_tambem_e_mensagem():
    conteudo = _linha(1000, [{"text": "pergunta paga?"}], renderer="liveChatPaidMessageRenderer")
    assert [m.texto for m in parse_mensagens_do_chat(conteudo)] == ["pergunta paga?"]


def test_texto_literal_mantem_erro_mencao_e_emoji_unicode_e_tira_o_customizado():
    runs = [
        {"text": "@Outro pq a UP tá contribuindo "},
        {"emoji": {"emojiId": "🤔"}},
        {"emoji": {"emojiId": "UCabc/xyz", "isCustomEmoji": True}},
        {"text": " ?"},
    ]
    assert texto_da_mensagem(runs) == "@Outro pq a UP tá contribuindo 🤔 ?"


def test_emoji_de_canal_sem_flag_tambem_sai():
    assert texto_da_mensagem([{"text": "oi"}, {"emoji": {"emojiId": "UCabc/xyz"}}]) == "oi"


def test_linha_quebrada_e_mensagem_vazia_sao_ignoradas_e_a_ordem_e_por_instante():
    conteudo = "\n".join(
        [
            _linha(5000, [{"text": "segunda"}]),
            "{não é json",
            _linha(3000, [{"emoji": {"emojiId": "UCabc/xyz", "isCustomEmoji": True}}]),
            _linha(1000, [{"text": "primeira"}]),
            json.dumps({"replayChatItemAction": {"actions": []}}),
        ]
    )
    assert [m.texto for m in parse_mensagens_do_chat(conteudo)] == ["primeira", "segunda"]


def test_o_parser_do_chat_heat_continua_igual():
    conteudo = _linha(1000, [{"text": "oi"}]) + "\n" + _linha(3000, [{"text": "tchau"}])
    assert parse_live_chat(conteudo) == [1.0, 3.0]

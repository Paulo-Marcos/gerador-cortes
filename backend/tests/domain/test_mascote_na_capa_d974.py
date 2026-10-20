"""D-974: no modo apresentador, o prompt da capa que DESCREVE o mascote é recusado.

As fixtures são trechos reais das chamadas da PROD de 18/10/2026: a 42b18dde
(Sonnet) desenhou o Sapo como "SECOND FIGURE" com o bloco do modo apresentador
na mão; a 7b1bcbcb (Gemini) obedeceu e só cita o mascote na lista do que evitar.
"""

import pytest
from app.domain.canal.protagonista_da_capa import (
    aviso_de_mascote_na_capa,
    bloco_do_modo,
    mascote_descrito,
)

# Chamada 42b18dde (resumida): o mascote descrito como coadjuvante.
_SONNET_42B18DDE = (
    "Vertical short cover, 9:16, 1080x1920 editorial 2D illustrated frame. PROTAGONIST, "
    "filling the central square chest-up: Nayib Bukele, slicked-back dark hair, crisp dark "
    "suit with no tie. SECOND FIGURE, the channel mascot, positioned close behind his right "
    "shoulder, physically the same adult human height as Bukele: the Sapo Analítico, "
    "anthropomorphic frog with mossy matte olive-green ink-stippled skin, wearing an "
    "unzipped olive-green bomber jacket with sewn patches over a plain black t-shirt. "
    'Overlaid in the art: "DESABAFAR SUA RAIVA NÃO RESOLVE NADA" in sulfur-yellow. '
    "Avoid: no watermark, no logo, no URL, no extra text, no second line, no villainous "
    "grimace, no mascot or protagonist placed at the exact center of the frame."
)

# Chamada 7b1bcbcb (resumida): o mascote só na lista do que evitar.
_GEMINI_7B1BCBCB = (
    '[APRESENTADOR="grade-de-expressoes-masculinas"]\n'
    "Vertical 9:16, 1080x1920, editorial 2D illustrated vertical short cover. Dominant "
    "chest-up portrait of the host centered within the 1080x1080 central square.\n"
    "EXPRESSION (host): calm, restrained, natural conversational expression.\n"
    "AVOID: no frog, no mascot, no cartoon animal, no watermark, no logo, no URL."
)


def test_o_prompt_da_chamada_42b18dde_descreve_o_mascote():
    assert mascote_descrito(_SONNET_42B18DDE, mascote="Sapo") == ["frog", "mascot", "sapo"]


def test_o_prompt_da_chamada_7b1bcbcb_passa():
    assert mascote_descrito(_GEMINI_7B1BCBCB, mascote="Sapo") == []


@pytest.mark.parametrize(
    "prompt",
    [
        # Thumbnail do YouTube no modo apresentador (a lista do AVOID sem "no").
        "Host at the left.\nAVOID: any frog, mascot or cartoon animal character anywhere.",
        # Capa do short 4ae901c0: a negação no meio do parágrafo.
        "Host chest-up, no subtitle. No Sapo, no frog, no mascot, no cartoon animal anywhere.",
        "Host chest-up, without an anthropomorphic frog, never mascot-like.",
    ],
)
def test_o_mascote_na_lista_do_que_evitar_nao_conta(prompt):
    assert mascote_descrito(prompt, mascote="Sapo") == []


@pytest.mark.parametrize(
    "prompt",
    [
        # Auditoria do PR #240: a frase da capa vai entre aspas e pode ter a palavra.
        'Host chest-up. "CHEGA DE ENGOLIR SAPO" in yellow with a black outline.',
        "Host chest-up. “O SAPO NÃO RESOLVE” in yellow.",
        # Negações que a primeira versão não via.
        "Host alone. No frog or mascot anywhere.",
        "Host alone, no green frog, bright backdrop.",
        "Host alone, not a mascot in sight.",
        "Host alone. Do not include the Sapo.",
        "Host alone. Exclude the frog.",
        "Host alone.\nAvoid any frog, mascot or cartoon animal character.",
        "Host alone.\nNegative: frog, mascot.",
        "Host alone.\nAVOID:\n- frog\n- mascot\n- watermark",
        "Preâmbulo: sem sapo, só o apresentador.\nHost alone.",
    ],
)
def test_frase_da_capa_e_negacoes_nao_contam(prompt):
    assert mascote_descrito(prompt, mascote="Sapo") == []


def test_a_negacao_vale_so_ate_o_fim_da_oracao():
    prompt = "No watermark, the frog stands behind the host."

    assert mascote_descrito(prompt, mascote="Sapo") == ["frog"]


def test_nome_com_simbolo_no_fim_ainda_casa():
    assert mascote_descrito("Robo-X! behind the host.", mascote="Robo-X!") == ["robo-x!"]


def test_o_nome_do_mascote_conta_inteiro_e_sem_caixa():
    assert mascote_descrito("The SAPO stands behind the host.", mascote="Sapo") == ["sapo"]
    assert mascote_descrito("A sapodilla fruit on the table.", mascote="Sapo") == []


def test_mascote_sem_nome_ainda_pega_frog_e_mascot():
    assert mascote_descrito("A frog behind the host.", mascote="") == ["frog"]


def test_o_aviso_corretivo_cita_o_que_foi_recusado():
    aviso = aviso_de_mascote_na_capa(["frog", "sapo"], mascote="Sapo")

    assert aviso.startswith("=== RESPOSTA ANTERIOR RECUSADA ===")
    assert "frog, sapo" in aviso
    assert "segunda figura" in aviso
    assert "no frog, no mascot" in aviso


def test_o_modo_apresentador_avisa_que_o_personagem_do_youtube_nao_e_ele():
    """A 7b1bcbcb vestiu o apresentador com a jaqueta bomber do Sapo."""
    bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=["pensativo"])

    assert "PROMPT DA THUMBNAIL DO YOUTUBE" in bloco
    assert "não é o apresentador" in bloco
    assert "nem a roupa do Sapo" in bloco


def test_o_modo_mascote_nao_ganha_o_aviso_do_youtube():
    bloco = bloco_do_modo("mascote", mascote="Sapo", expressoes=[])

    assert "PROMPT DA THUMBNAIL DO YOUTUBE" not in bloco

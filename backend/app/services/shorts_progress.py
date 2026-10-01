"""Acompanhamento (em memória) do render de um short, por candidato (D-485).

O render do short nasceu reusando o worker, a fila e o gate de RAM do pipeline
horizontal — e NÃO reusou o instrumento que torna tudo isso legível. O resultado
foi cinco minutos e meio de silêncio absoluto entre o clique e o arquivo, com o
operador sem meio de distinguir "rodando" de "morto".

Por que o tempo decorrido está aqui e não só os passos: no bruto, cada etapa dura
segundos e a lista basta. No short, a camada do Remotion sozinha leva minutos —
saber QUAL passo roda não responde "há quanto tempo", que é a pergunta de quem
desconfia que travou.

In-memory, mesmo arranjo do `BrutoProgress`: vale para o processo do backend
local, e um reload do uvicorn limpa o store. A tela então cai no estado do banco
como fonte de verdade — tem prévia ou não tem.
"""

from __future__ import annotations

import re
import time

# Os três passos do `render_short._produzir`, na ordem em que ele os despacha.
PASSOS_RENDER: list[tuple[str, str]] = [
    ("recorte", "Recortar 9:16"),
    ("camada", "Desenhar legenda e cenas"),
    ("composicao", "Compor o vídeo final"),
]

# status por passo: "pendente" | "rodando" | "concluido" | "erro"


class ShortsProgress:
    """Store por short do render em curso."""

    _store: dict[str, dict] = {}

    @classmethod
    def iniciar(cls, short_id: str, *, estagio: str) -> None:
        """Zera os passos e liga o cronômetro. `estagio` é "previa" ou "final"."""
        cls._store[short_id] = {
            "estagio": estagio,
            "iniciado_em": time.monotonic(),
            "concluido": False,
            "erro": None,
            # D-843: o motivo da espera no portão de render; None = já tem vaga.
            "fila": None,
            "passos": [
                {"chave": chave, "label": label, "status": "pendente"}
                for chave, label in PASSOS_RENDER
            ],
        }

    @classmethod
    def marcar(cls, short_id: str, chave: str, status: str) -> None:
        """Atualiza um passo. No-op quando não há render em curso para o short."""
        sessao = cls._store.get(short_id)
        if not sessao:
            return
        for passo in sessao["passos"]:
            if passo["chave"] == chave:
                passo["status"] = status
                return

    @classmethod
    def na_fila(cls, short_id: str, motivo: str | None) -> None:
        """Conta por que o render ainda não começou (vaga ou RAM); None ao entrar."""
        sessao = cls._store.get(short_id)
        if sessao:
            sessao["fila"] = motivo

    @classmethod
    def concluir(cls, short_id: str) -> None:
        sessao = cls._store.get(short_id)
        if sessao:
            sessao["concluido"] = True

    @classmethod
    def falhar(cls, short_id: str, erro: str) -> None:
        """Guarda o erro NO STORE, porque ele não volta mais pela resposta HTTP.

        O render virou assíncrono: o POST responde na hora e a falha acontece
        depois. Sem isto, um render que morre no meio deixaria a tela em
        "rodando" para sempre — pior que o silêncio que esta demanda veio
        resolver.
        """
        sessao = cls._store.get(short_id)
        if not sessao:
            return
        sessao["erro"] = erro
        sessao["concluido"] = True
        for passo in sessao["passos"]:
            if passo["status"] == "rodando":
                passo["status"] = "erro"

    @classmethod
    def em_curso(cls, short_id: str) -> bool:
        """Se há um render rodando agora — o que impede disparar outro em cima."""
        sessao = cls._store.get(short_id)
        return bool(sessao) and not sessao["concluido"]

    @classmethod
    def get(cls, short_id: str) -> dict | None:
        """O estado do render, com o tempo decorrido calculado na leitura.

        `None` quando nunca houve render deste short neste processo.
        """
        sessao = cls._store.get(short_id)
        if not sessao:
            return None
        return {
            "estagio": sessao["estagio"],
            "concluido": sessao["concluido"],
            "erro": sessao["erro"],
            "fila": sessao["fila"],
            "decorrido_seg": round(time.monotonic() - sessao["iniciado_em"], 1),
            "passos": [dict(passo) for passo in sessao["passos"]],
        }


# D-568: o log do worker, que ja existe e ninguem lia.
#
# O `native_worker` escreve um `worker_debug.log` no `cwd` de cada job — e o
# render do short passa o diretorio DELE como cwd, entao o arquivo ja nasce por
# short, com uma entrada por passo:
#
#   [iso] Job: <id>            CMD: ...            CWD: ...
#   [iso] Fim: <id> status=sucesso duration_ms=409048
#
# E o que o operador acompanha no horizontal ("vai atualizando o status de
# execucao, e no final mostra ate quanto tempo demorou"). Faltava so servir.
LINHAS_DO_LOG = 80
LARGURA_DA_LINHA = 400

_FIM = re.compile(r"Fim: \S+ status=(\w+) duration_ms=(\d+)")


def resumir_log(texto: str, *, linhas: int = LINHAS_DO_LOG) -> dict:
    """As ultimas linhas do log do worker, e quanto cada passo levou.

    A linha de CMD do ffmpeg tem varios kilobytes — um filtergraph inteiro numa
    linha so. Cortar em `LARGURA_DA_LINHA` mantem o log legivel numa caixa de
    tela sem esconder o que importa: o inicio dela ja diz qual binario rodou.

    >>> resumir_log("[t] Fim: j_1 status=sucesso duration_ms=1500")["duracoes_ms"]
    [1500]
    """
    todas = [linha.rstrip() for linha in texto.splitlines() if linha.strip()]
    recorte = todas[-linhas:]
    return {
        "linhas": [
            linha if len(linha) <= LARGURA_DA_LINHA else linha[:LARGURA_DA_LINHA] + " […]"
            for linha in recorte
        ],
        "truncado": len(todas) > len(recorte),
        # Uma duracao por passo concluido, na ordem em que sairam.
        "duracoes_ms": [int(m.group(2)) for m in _FIM.finditer(texto)],
    }

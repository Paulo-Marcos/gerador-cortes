from app.core.logging import operational_debug
from app.domain.compartilhado.time_convert import hms_to_seg

# Só as primeiras palavras vão ao log, para não inundar o console.
_PALAVRAS_NO_LOG = 5


class TimelineMath:
    @staticmethod
    def mapear_tempo_linear(
        tempo_original: float, segmentos_mantidos: list[dict[str, float]]
    ) -> float | None:
        """
        Mapeia um timestamp do vídeo original para a nova timeline contínua (Editada).
        Usa uma pequena tolerância (epsilon) para lidar com arredondamentos de float.

        `segmentos_mantidos` vem na ORDEM EM QUE TOCAM, que desde o D-576 pode não
        ser a cronológica (arranjo de blocos). Por isso a varredura percorre a lista
        inteira: o atalho antigo — `return None` assim que o tempo ficava atrás do
        segmento da vez — só valia para entrada ordenada, e com a ordem embaralhada
        descartaria em silêncio toda palavra de um bloco movido para trás. Para
        entrada cronológica o resultado é idêntico (tempo em buraco de desvio não
        casa com nenhum segmento e cai no `None` do fim).
        """
        tempo_acumulado = 0.0
        epsilon = 0.005  # 5ms de tolerância

        for seg in segmentos_mantidos:
            start = float(seg["start"])
            end = float(seg["end"])

            # Se o tempo original está dentro do segmento (com tolerância)
            if (start - epsilon) <= tempo_original <= (end + epsilon):
                # Clipa o offset para garantir que não seja negativo
                offset_dentro_do_seg = max(0.0, tempo_original - start)
                return round(tempo_acumulado + offset_dentro_do_seg, 4)

            tempo_acumulado += end - start

        return None

    @staticmethod
    def recalcular_transcricao(
        transcricao_original: list[dict], segmentos_mantidos: list[dict[str, float]]
    ) -> list[dict]:
        """Remapeia timestamps da transcrição para a timeline editada (sem desvios).

        D-576: `segmentos_mantidos` chega na ORDEM DE EXIBIÇÃO e é consumido assim —
        ordená-lo aqui destruiria justamente a informação que o arranjo de blocos
        carrega. A transcrição de saída é reordenada no fim pelos tempos NOVOS,
        porque a leitura da live deixa de valer como ordem quando os blocos trocam
        de lugar.
        """
        min_start = min((float(s["start"]) for s in segmentos_mantidos), default=0.0)
        epsilon = 0.005
        nova_transcricao = []

        for item in transcricao_original:
            try:
                # O backend usa "inicio" e "fim" ou "start" e "end"
                val_start = item.get("start", item.get("inicio", 0))
                val_end = item.get("end", item.get("fim", 0))

                try:
                    t_start = float(val_start)
                except ValueError:
                    t_start = hms_to_seg(str(val_start))

                try:
                    t_end = float(val_end)
                except ValueError:
                    t_end = hms_to_seg(str(val_end))

            except (AttributeError, TypeError, ValueError):
                continue

            # Se o tempo original da palavra está ANTES do primeiro segmento mantido, ela deve sumir
            if t_start < (min_start - epsilon):
                continue

            novo_inicio = TimelineMath.mapear_tempo_linear(t_start, segmentos_mantidos)
            novo_fim = TimelineMath.mapear_tempo_linear(t_end, segmentos_mantidos)

            # Log apenas para as primeiras 5 palavras para não inundar o console
            if len(nova_transcricao) < _PALAVRAS_NO_LOG:
                novo_inicio_fmt = round(novo_inicio, 3) if novo_inicio is not None else "None"
                operational_debug(
                    "TimelineMath",
                    f"Remap: '{item.get('texto')}' {t_start} -> {novo_inicio_fmt}",
                )

            if novo_inicio is not None or novo_fim is not None:
                novo_item = item.copy()

                # Se início ou fim caírem num buraco (desvio),
                # ajustamos para o limite do que foi mantido.
                if novo_inicio is None:
                    novo_inicio = novo_fim
                if novo_fim is None:
                    novo_fim = novo_inicio

                # Se, após o ajuste, a duração for zero ou invertida, ignoramos
                if novo_inicio >= novo_fim:
                    continue

                novo_item["start"] = round(novo_inicio, 3)
                novo_item["end"] = round(novo_fim, 3)
                novo_item["inicio"] = novo_item["start"]
                novo_item["fim"] = novo_item["end"]

                # As `palavras` (D-337) vem em tempo ABSOLUTO, igual ao `start` do
                # segmento, e o `item.copy()` acima as trazia INTACTAS para uma
                # transcricao ja rebaseada. A granularizacao corta pelas bordas
                # reais (`_dividir_por_bordas_reais`), entao todo segmento longo o
                # bastante para ser dividido saia em tempo de LIVE no meio de uma
                # transcricao relativa — e as cenas geradas dali nasciam com a
                # posicao na live. Segmento curto passava intacto, o que produzia a
                # mistura observada (cena 11 em 8804s num corte de 613s).
                palavras_remapeadas = TimelineMath._remapear_palavras(
                    item.get("palavras"), segmentos_mantidos
                )
                if palavras_remapeadas:
                    novo_item["palavras"] = palavras_remapeadas
                else:
                    novo_item.pop("palavras", None)

                nova_transcricao.append(novo_item)

        nova_transcricao.sort(key=lambda item: float(item["start"]))
        return nova_transcricao

    @staticmethod
    def _remapear_palavras(
        palavras: object, segmentos_mantidos: list[dict[str, float]]
    ) -> list[dict]:
        """Reposiciona o timing por palavra na timeline editada.

        Mesmo mapeamento do segmento que as contem. Palavra que cai dentro de um
        trecho removido some — ela nao existe no video final.
        """
        if not isinstance(palavras, list):
            return []
        remapeadas = []
        for palavra in palavras:
            if not isinstance(palavra, dict):
                continue
            try:
                original = float(palavra["inicio_seg"])
            except (KeyError, TypeError, ValueError):
                continue
            novo = TimelineMath.mapear_tempo_linear(original, segmentos_mantidos)
            if novo is None:
                continue
            remapeadas.append({**palavra, "inicio_seg": round(novo, 3)})
        return remapeadas

    @staticmethod
    def gerar_ffconcat_file(
        segmentos_mantidos: list[dict[str, float]], filepath_video_original: str
    ) -> str:
        """Gera conteúdo para ffmpeg -f concat com inpoint/outpoint."""
        linhas = []
        for seg in sorted(segmentos_mantidos, key=lambda x: float(x["start"])):
            caminho_limpo = filepath_video_original.replace("'", "\\'")
            linhas.append(f"file '{caminho_limpo}'")
            linhas.append(f"inpoint {float(seg['start']):.3f}")
            linhas.append(f"outpoint {float(seg['end']):.3f}")

        return "\n".join(linhas)

from app.domain.time_convert import hms_to_seg
from app.services.app_logging import operational_debug


class TimelineMath:
    @staticmethod
    def mapear_tempo_linear(
        tempo_original: float, segmentos_mantidos: list[dict[str, float]]
    ) -> float | None:
        """
        Mapeia um timestamp do vídeo original para a nova timeline contínua (Editada).
        Usa uma pequena tolerância (epsilon) para lidar com arredondamentos de float.
        """
        tempo_acumulado = 0.0
        epsilon = 0.005  # 5ms de tolerância

        for seg in segmentos_mantidos:
            start = float(seg["start"])
            end = float(seg["end"])
            duracao_seg = end - start

            # Se o tempo original está dentro do segmento (com tolerância)
            if (start - epsilon) <= tempo_original <= (end + epsilon):
                # Clipa o offset para garantir que não seja negativo
                offset_dentro_do_seg = max(0.0, tempo_original - start)
                res = round(tempo_acumulado + offset_dentro_do_seg, 4)
                # print(f"[TimelineMath] mapear({tempo_original}) -> {res} (seg [{start}-{end}], acum={tempo_acumulado})")
                return res

            if tempo_original < (start - epsilon):
                return None

            tempo_acumulado += duracao_seg

        return None

    @staticmethod
    def recalcular_transcricao(
        transcricao_original: list[dict], segmentos_mantidos: list[dict[str, float]]
    ) -> list[dict]:
        """Remapeia timestamps da transcrição para a timeline editada (sem desvios)."""
        segmentos_mantidos = sorted(segmentos_mantidos, key=lambda x: float(x["start"]))
        min_start = float(segmentos_mantidos[0]["start"]) if segmentos_mantidos else 0.0
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

            except Exception:
                continue

            # Se o tempo original da palavra está ANTES do primeiro segmento mantido, ela deve sumir
            if t_start < (min_start - epsilon):
                # print(f"[TimelineMath] Skip palavra '{item.get('texto')}' (start {t_start} < min {min_start})")
                continue

            novo_inicio = TimelineMath.mapear_tempo_linear(t_start, segmentos_mantidos)
            novo_fim = TimelineMath.mapear_tempo_linear(t_end, segmentos_mantidos)

            # Log apenas para as primeiras 5 palavras para não inundar o console
            if len(nova_transcricao) < 5:
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

                nova_transcricao.append(novo_item)

        return nova_transcricao

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

from app.domain.chunker import fatiar_transcricao


def _seg(inicio, fim, texto="texto"):
    return {"inicio": inicio, "fim": fim, "texto": texto}


def _seg_start_end(start, end, texto="texto"):
    return {"start": start, "end": end, "texto": texto}


class TestFatiarTranscricao:
    def test_lista_vazia_retorna_lista_vazia(self):
        assert fatiar_transcricao([]) == []

    def test_transcricao_pequena_retorna_um_unico_chunk(self):
        transcricao = [
            _seg("00:00:00.000", "00:05:00.000", "inicio"),
            _seg("00:10:00.000", "00:15:00.000", "meio"),
            _seg("00:20:00.000", "00:25:00.000", "fim"),
        ]
        result = fatiar_transcricao(transcricao, chunk_tamanho_seg=2400.0)
        assert len(result) == 1
        assert len(result[0]) == 3

    def test_chunk_unico_contem_todos_segmentos(self):
        transcricao = [_seg(f"00:{i:02d}:00.000", f"00:{i:02d}:30.000") for i in range(10)]
        result = fatiar_transcricao(transcricao, chunk_tamanho_seg=2400.0)
        total = sum(len(c) for c in result)
        assert total >= len(transcricao)

    def test_gera_multiplos_chunks_para_transcricao_longa(self):
        # Cria transcrição de 3 horas (10800 segundos)
        # Com chunk de 40min (2400s) e sem min_last_chunk forçando merge,
        # esperamos pelo menos 2 chunks.
        transcricao = []
        for i in range(0, 10800, 120):  # segmentos a cada 2 minutos
            h = i // 3600
            m = (i % 3600) // 60
            inicio = f"{h:02d}:{m:02d}:00.000"
            fim = f"{h:02d}:{m:02d}:30.000"
            transcricao.append(_seg(inicio, fim))

        result = fatiar_transcricao(
            transcricao,
            chunk_tamanho_seg=2400.0,
            overlap_seg=300.0,
            min_last_chunk_seg=60.0,  # limite baixo para não forçar merge
        )
        assert len(result) >= 2

    def test_aceita_campos_start_end_alem_de_inicio_fim(self):
        transcricao = [
            _seg_start_end("00:00:00.000", "00:05:00.000", "a"),
            _seg_start_end("00:10:00.000", "00:15:00.000", "b"),
        ]
        result = fatiar_transcricao(transcricao, chunk_tamanho_seg=2400.0)
        assert len(result) == 1

    def test_min_last_chunk_evita_chunk_muito_pequeno(self):
        # Cria transcrição de ~50min. Com chunk=40min e min_last_chunk=20min,
        # o restante (10min) deve ser absorvido pelo primeiro chunk.
        transcricao = []
        for i in range(0, 3000, 60):  # 50 minutos, 1 por minuto
            m = i // 60
            inicio = f"00:{m:02d}:00.000"
            fim = f"00:{m:02d}:30.000"
            transcricao.append(_seg(inicio, fim))

        result = fatiar_transcricao(
            transcricao,
            chunk_tamanho_seg=2400.0,  # 40min
            overlap_seg=300.0,
            min_last_chunk_seg=1200.0,  # 20min
        )
        # O restante (~10min) é menor que min_last_chunk (20min), então
        # deve ser absorvido no primeiro chunk → apenas 1 chunk
        assert len(result) == 1

    def test_chunks_tem_overlap(self):
        # Transcrição de 90min → com chunk=40min, overlap=10min e min_last_chunk=5min
        # Esperamos 2 chunks, e o conteúdo do overlap deve aparecer em ambos.
        transcricao = []
        for i in range(0, 5400, 60):  # 90 min
            m = i // 60
            inicio = f"00:{m:02d}:00.000"
            fim = f"00:{m:02d}:30.000"
            transcricao.append(_seg(inicio, fim, texto=f"seg_{m}"))

        result = fatiar_transcricao(
            transcricao,
            chunk_tamanho_seg=2400.0,  # 40min
            overlap_seg=600.0,  # 10min overlap
            min_last_chunk_seg=60.0,  # limite baixo
        )
        assert len(result) >= 2
        # Verifica que existem segmentos em comum entre chunk 0 e chunk 1
        textos_0 = {s["texto"] for s in result[0]}
        textos_1 = {s["texto"] for s in result[1]}
        assert len(textos_0 & textos_1) > 0, "Esperava overlap entre chunks"

    def test_nenhum_chunk_vazio_retornado(self):
        transcricao = [_seg("00:00:00.000", "00:05:00.000")]
        result = fatiar_transcricao(transcricao)
        for chunk in result:
            assert len(chunk) > 0

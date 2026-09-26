import type { DestinoPublicacao } from '@/types/models';
import { api, dados, type Schema } from '@/shared/api';

// O caminho até a publicação: o status de exportação de cada corte, o upload
// para o YouTube (avulso e em massa), a marca manual de publicado e o desfazer
// dessa marca (D-566). D-722: saiu de lib/api.ts para a feature, sobre o
// cliente gerado.

export type ExportStatusResponse = Schema<'StatusExportResponse'>;
export type YouTubeUploadRequest = Schema<'YouTubeUploadRequest'>;
export type YouTubeUploadResponse = Schema<'YouTubeUploadResponse'>;
export type YouTubeManualPublishRequest = Schema<'MarcarPublicadoRequest'>;
export type MarcarPublicadoResponse = Schema<'MarcarPublicadoResponse'>;
export type LiberarPublicacaoRequest = { destino: DestinoPublicacao };
export type LiberarPublicacaoResponse = Schema<'LiberarPublicacaoResponse'>;
export type BulkYoutubeRequest = Schema<'BulkYouTubeRequest'>;
export type BulkYoutubeResponse = Schema<'BulkYoutubeResponse'>;

const doCorte = (corteId: string) => ({ params: { path: { corte_id: corteId } } });

export const publicacaoApi = {
  exportStatus: (projetoId: string) =>
    dados(
      api.GET('/api/export/projeto/{projeto_id}/status', {
        params: { path: { projeto_id: projetoId } },
      }),
    ),

  uploadYouTube: (corteId: string, body: YouTubeUploadRequest) =>
    dados(api.POST('/api/export/corte/{corte_id}/youtube', { ...doCorte(corteId), body })),

  marcarPublicadoYouTube: (corteId: string, body: YouTubeManualPublishRequest) =>
    dados(
      api.POST('/api/export/corte/{corte_id}/youtube/marcar-publicado', {
        ...doCorte(corteId),
        body,
      }),
    ),

  /**
   * D-566: desfaz a marca de publicação de um destino.
   *
   * O espelho de `marcarPublicadoYouTube`: aquele conta que o vídeo está lá
   * fora, este conta que não está mais. Sem ele, apagar o vídeo do YouTube
   * para reprocessar deixava o corte preso — o botão de enviar some quando há
   * URL publicada e o backend responde "já publicado; upload ignorado".
   */
  liberarPublicacao: (corteId: string, body: LiberarPublicacaoRequest) =>
    dados(api.POST('/api/export/corte/{corte_id}/publicacao/liberar', { ...doCorte(corteId), body })),

  bulkYoutube: (projetoId: string, body: BulkYoutubeRequest) =>
    dados(
      api.POST('/api/export/projeto/{projeto_id}/bulk-youtube', {
        params: { path: { projeto_id: projetoId } },
        body,
      }),
    ),
};

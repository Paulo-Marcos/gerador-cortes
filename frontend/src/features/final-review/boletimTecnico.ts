import { api, dados, type Schema } from '@/shared/api';

// D-1015: cliente do boletim técnico (volume, imagem parada, emendas) e o texto
// em português simples que a Revisão Final mostra. Endpoints em
// routers/boletim_tecnico.py. O boletim só AVISA: nada aqui bloqueia publicar.

export type BoletimTecnico = Schema<'BoletimResponse'>;
export type ParadaDeImagem = NonNullable<BoletimTecnico['paradas']>[number];
export type AlvoDoBoletim = { tipo: 'corte' | 'short'; id: string };

export const boletimTecnicoApi = {
  obter: ({ tipo, id }: AlvoDoBoletim) =>
    tipo === 'corte'
      ? dados(api.GET('/api/boletim-tecnico/corte/{corte_id}', { params: { path: { corte_id: id } } }))
      : dados(api.GET('/api/boletim-tecnico/short/{short_id}', { params: { path: { short_id: id } } })),
  remedir: ({ tipo, id }: AlvoDoBoletim) =>
    tipo === 'corte'
      ? dados(
          api.POST('/api/boletim-tecnico/corte/{corte_id}/remedir', {
            params: { path: { corte_id: id } },
          }),
        )
      : dados(
          api.POST('/api/boletim-tecnico/short/{short_id}/remedir', {
            params: { path: { short_id: id } },
          }),
        ),
};

/** Referência de volume: convenção de mercado, não exigência de plataforma. */
export const TEXTO_DA_REFERENCIA =
  'Referência de volume: −14 LUFS (com 1 de folga) e pico até −1 dBTP. É uma convenção usada no mercado, ' +
  'não uma exigência publicada pelo YouTube, TikTok ou Instagram.';

export const TEXTO_QUE_NAO_BLOQUEIA =
  'O boletim só avisa. Quem decide publicar é você.';

const virgula = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',').replace('-', '−');

export function relogio(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function linhaDeVolume(v: NonNullable<BoletimTecnico['volume']>): string {
  return `${virgula(v.integrado_lufs)} LUFS · pico ${virgula(v.pico_dbtp)} dBTP · variação ${virgula(v.lra_lu)} LU`;
}

const ORIGEM: Record<ParadaDeImagem['origem'], string> = {
  live: 'já estava parada no bruto, então veio da live',
  render: 'surgiu no render (o bruto estava em movimento)',
  nao_verificada: 'origem não conferida (o bruto não está mais no disco)',
};

export function linhaDeParada(p: ParadaDeImagem): string {
  return `${relogio(p.inicio_seg)} · ${virgula(p.duracao_seg, 2)} s · ${ORIGEM[p.origem]}`;
}

export function linhaDeEmendas(e: NonNullable<BoletimTecnico['emendas']>): string {
  if (e.total === 0) return 'Sem emendas: o vídeo é um trecho só.';
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  return (
    `${plural(e.total, 'emenda', 'emendas')} · ` +
    `${e.com_som_dos_dois_lados} com som dos dois lados · ` +
    `${plural(e.acima_do_p99, 'com degrau acima do normal da fala', 'com degrau acima do normal da fala')}`
  );
}

/** Quantos avisos o boletim pronto levanta (volume + paradas + emendas). */
export function totalDeAvisos(b: BoletimTecnico): number {
  return (
    (b.volume?.avisos.length ?? 0) + (b.paradas?.length ?? 0) + (b.emendas?.acima_do_p99 ?? 0)
  );
}

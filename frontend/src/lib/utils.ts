import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatarDuracao(segundos: number): string {
  if (!segundos || segundos < 0) return '0:00';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatarDuracaoHMS(segundos: number): string {
  if (!segundos || segundos < 0) return '00:00:00';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatarDataLive(dataLive: string): string {
  if (!dataLive) return '';

  const compactMatch = dataLive.trim().match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?$/);
  if (compactMatch) {
    const [, ano, mes, dia, hora, minuto] = compactMatch;
    const data = `${dia}/${mes}/${ano}`;
    return hora && minuto ? `${data} ${hora}:${minuto}` : data;
  }

  const parsed = new Date(dataLive);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function extrairYoutubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

export function thumbnailUrl(
  youtubeUrl: string,
  quality: 'mq' | 'hq' | 'max' = 'mq',
): string | null {
  const id = extrairYoutubeId(youtubeUrl);
  if (!id) return null;
  const map = { mq: 'mqdefault', hq: 'hqdefault', max: 'maxresdefault' };
  return `https://i.ytimg.com/vi/${id}/${map[quality]}.jpg`;
}

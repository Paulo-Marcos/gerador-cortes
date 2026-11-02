import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { PublicarEmLoteModal } from '../PublicarEmLoteModal';
import { RoboDoLote } from '../RoboDoLote';
import { PADROES_DO_LOTE, seguraPublicacaoDoInstagram } from '../padroesDoLote';

/**
 * D-1011. O Paulo só publica pelos robôs, nos horários do canal e sem conferir
 * o botão final; o lote tem de abrir assim. O freio do Instagram existe porque
 * fora de "distribuir" vários Reels sairiam todos juntos (D-1010).
 */
const SHORTS = [1, 2].map((n) => ({
  id: `s${n}`,
  numero: n,
  titulo: `Corte ${n}`,
  duracao_seg: 30,
  origem: '',
})) as never;

function modal(plataformasIniciais: string[]) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PublicarEmLoteModal open onClose={() => {}} shorts={SHORTS} plataformasIniciais={plataformasIniciais} />
    </QueryClientProvider>,
  );
}

const ligados = (html: string) => html.match(/type="checkbox"[^>]*checked=""/g)?.length ?? 0;
const caixas = (html: string) => html.match(/type="checkbox"/g)?.length ?? 0;

describe('padrões do lote', () => {
  it('abrem com os dois robôs, o publicar sozinho e a agenda do canal', () => {
    expect(PADROES_DO_LOTE).toEqual({
      tiktokAssistido: true,
      instagramAssistido: true,
      publicarSozinho: true,
      modo: 'distribuir',
    });
  });

  it('o modal nasce com TikTok, Instagram e "aperta o botão final" ligados', () => {
    const html = modal(['tiktok', 'instagram_reels']);
    expect(caixas(html)).toBe(3);
    expect(ligados(html)).toBe(3);
    expect(html).toContain('o robô sobe pelo navegador');
    expect(html).toContain('também aperta o botão final');
  });

  it('o modo nasce em "Distribuir pela janela do canal"', () => {
    const html = modal(['tiktok']);
    expect(html).toContain('aria-pressed="true" aria-label="Distribuir pela janela do canal"');
    expect(html).toContain('aria-pressed="false" aria-label="Agora"');
  });
});

describe('RoboDoLote: cada item segue desligável', () => {
  const base = {
    temTiktok: true,
    temInstagram: true,
    tiktokAssistido: false,
    instagramAssistido: false,
    publicarSozinho: true,
    seguraInstagram: false,
    onTiktok: () => {},
    onInstagram: () => {},
    onSozinho: () => {},
  };

  it('desligados, os robôs e o botão final chegam desligados quando o operador os desliga', () => {
    const html = renderToStaticMarkup(<RoboDoLote {...base} />);
    expect(html).not.toContain('também aperta o botão final');
    expect(caixas(html)).toBe(2);
    expect(ligados(html)).toBe(0);
  });

  it('o aviso do freio só aparece quando o robô vai parar no botão final', () => {
    const ligado = { ...base, tiktokAssistido: true, instagramAssistido: true };
    expect(renderToStaticMarkup(<RoboDoLote {...ligado} />)).not.toContain('para no botão final,');
    expect(renderToStaticMarkup(<RoboDoLote {...ligado} seguraInstagram />)).toContain(
      'para no botão final,',
    );
  });
});

describe('freio do Instagram fora da agenda distribuída', () => {
  it('vários Reels em "agora" ou "uma data" seguram o botão final', () => {
    expect(seguraPublicacaoDoInstagram(true, 5, 'agora')).toBe(true);
    expect(seguraPublicacaoDoInstagram(true, 5, 'uma_data')).toBe(true);
  });
  it('um Reel só, ou robô desligado, não segura', () => {
    expect(seguraPublicacaoDoInstagram(true, 1, 'agora')).toBe(false);
    expect(seguraPublicacaoDoInstagram(false, 5, 'agora')).toBe(false);
  });
  it('na agenda distribuída, o robô agenda sozinho', () => {
    expect(seguraPublicacaoDoInstagram(true, 5, 'distribuir')).toBe(false);
  });
});

describe('o freio chega ao envio do lote', () => {
  it('o modal só manda publicarSozinho quando o freio não está puxado', () => {
    const fonte = readFileSync('src/features/shorts/PublicarEmLoteModal.tsx', 'utf-8');
    expect(fonte).toMatch(/publicarSozinho: temRobo && publicarSozinho && !seguraInstagram/);
  });
});

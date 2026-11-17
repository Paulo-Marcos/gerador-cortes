import { useState } from 'react';
import { Busca } from '@/components/ui/busca';
import { CartaoDeOpcao } from '@/components/ui/cartao-de-opcao';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { GrupoDeRadio, Radio } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

// D-1116 (E-069 H-08): a seção "Entrada" da página Kit. Mostra cada campo em todos os
// estados da §3.4 para a comparação ser feita de uma vez; a H-12 monta a página inteira.

const FORMATOS = [
  { valor: 'mp4', rotulo: 'MP4 (H.264)' },
  { valor: 'mov', rotulo: 'MOV (ProRes)' },
  { valor: 'webm', rotulo: 'WebM', desabilitada: true },
];

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-cartao border border-fio bg-vidro p-5">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-fg-3">{titulo}</h3>
      {children}
    </section>
  );
}

function BlocoDeCampos() {
  const [titulo, setTitulo] = useState('Corte do episódio 12');
  return (
    <Bloco titulo="Campo · estados">
      <Field rotulo="Repouso (vazio)" ajuda="Até 100 caracteres">
        <Input aparencia="sala" placeholder="Título do corte" />
      </Field>
      <Field rotulo="Preenchido">
        <Input aparencia="sala" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      </Field>
      <Field rotulo="Erro" erro="Informe o título do corte" obrigatorio>
        <Input aparencia="sala" defaultValue="" placeholder="Título do corte" />
      </Field>
      <Field rotulo="Desabilitado">
        <Input aparencia="sala" disabled defaultValue="Definido pela live" />
      </Field>
      <Field rotulo="Carregando">
        <Input aparencia="sala" carregando="Buscando as capas da live…" />
      </Field>
      <Field rotulo="Texto longo" ajuda="A descrição vai ao YouTube">
        <Textarea defaultValue="Resumo do trecho em que o convidado explica o método." />
      </Field>
    </Bloco>
  );
}

function BlocoDeBuscaESelect() {
  const [busca, setBusca] = useState('');
  const [formato, setFormato] = useState<string | undefined>('mp4');
  return (
    <Bloco titulo="Busca e select">
      <Busca
        value={busca}
        aoMudar={setBusca}
        placeholder="Buscar corte"
        aria-label="Buscar corte"
      />
      <Busca value="" aoMudar={() => {}} carregando="Buscando cortes…" aria-label="Buscando" />
      <Field rotulo="Formato de saída">
        <Select opcoes={FORMATOS} value={formato} onValueChange={setFormato} />
      </Field>
      <Field rotulo="Select com erro" erro="Escolha um formato">
        <Select opcoes={FORMATOS} placeholder="Selecione" />
      </Field>
      <Field rotulo="Select desabilitado">
        <Select opcoes={FORMATOS} value="mp4" disabled />
      </Field>
      <Field rotulo="Select carregando">
        <Select opcoes={FORMATOS} carregando="Buscando canais…" />
      </Field>
    </Bloco>
  );
}

function BlocoDeLigarEMarcar() {
  const [legendas, setLegendas] = useState(true);
  const [redes, setRedes] = useState({ yt: true, tt: false });
  return (
    <Bloco titulo="Switch e checkbox">
      <label className="flex items-center justify-between gap-3 text-[13px]">
        Legendas automáticas
        <Switch
          checked={legendas}
          onCheckedChange={setLegendas}
          aria-label="Legendas automáticas"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-[13px]">
        Desligado
        <Switch checked={false} onCheckedChange={() => {}} aria-label="Desligado" />
      </label>
      <label className="flex items-center justify-between gap-3 text-[13px] text-fg-off">
        Desabilitado
        <Switch checked={false} onCheckedChange={() => {}} disabled aria-label="Desabilitado" />
      </label>
      <label className="flex items-center justify-between gap-3 text-[13px]">
        Carregando
        <Switch checked onCheckedChange={() => {}} carregando aria-label="Carregando" />
      </label>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 text-[13px]">
          <Checkbox
            checked={redes.yt}
            onCheckedChange={(v) => setRedes((r) => ({ ...r, yt: v }))}
            aria-label="YouTube"
          />
          YouTube
        </label>
        <label className="flex items-center gap-2.5 text-[13px]">
          <Checkbox
            checked={redes.tt}
            onCheckedChange={(v) => setRedes((r) => ({ ...r, tt: v }))}
            aria-label="TikTok"
          />
          TikTok
        </label>
        <label className="flex items-center gap-2.5 text-[13px]">
          <Checkbox
            checked={redes.yt && redes.tt ? true : redes.yt || redes.tt ? 'mixed' : false}
            onCheckedChange={(v) => setRedes({ yt: v, tt: v })}
            aria-label="Todas as redes"
          />
          Todas as redes (parcial)
        </label>
        <label className="flex items-center gap-2.5 text-[13px] text-fg-off">
          <Checkbox checked={false} onCheckedChange={() => {}} disabled aria-label="Instagram" />
          Instagram (desabilitado)
        </label>
      </div>
    </Bloco>
  );
}

function BlocoDeEscolhaUnica() {
  const [formato, setFormato] = useState<string | undefined>('mp4');
  const [layout, setLayout] = useState<string | undefined>('vertical');
  return (
    <Bloco titulo="Radio e cartão de opção">
      <GrupoDeRadio
        value={formato}
        onValueChange={setFormato}
        aria-label="Formato"
        className="flex flex-col gap-3"
      >
        {FORMATOS.map((f) => (
          <label key={f.valor} className="flex items-center gap-2.5 text-[13px]">
            <Radio value={f.valor} disabled={f.desabilitada} aria-label={f.rotulo} />
            {f.rotulo}
          </label>
        ))}
      </GrupoDeRadio>
      <GrupoDeRadio
        value={layout}
        onValueChange={setLayout}
        aria-label="Layout do corte"
        className="grid gap-3 sm:grid-cols-2"
      >
        <CartaoDeOpcao value="vertical" titulo="Vertical" descricao="9:16, para shorts e Reels" />
        <CartaoDeOpcao value="horizontal" titulo="Horizontal" descricao="16:9, como a live" />
        <CartaoDeOpcao
          value="quadrado"
          titulo="Quadrado"
          descricao="Indisponível neste canal"
          disabled
        />
      </GrupoDeRadio>
    </Bloco>
  );
}

export function KitEntrada() {
  return (
    <div className="grid gap-4 text-fg md:grid-cols-2" data-kit="entrada">
      <BlocoDeCampos />
      <BlocoDeBuscaESelect />
      <BlocoDeLigarEMarcar />
      <BlocoDeEscolhaUnica />
    </div>
  );
}

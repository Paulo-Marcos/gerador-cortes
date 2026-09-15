// E-021: formulário "burro" de edição de UMA skill editorial do canal. Sem I/O:
// recebe a skill (valor-do-canal + default) e devolve o payload via `onSave`; o
// reset por campo é delegado via `onReset`. Ressincroniza o estado local quando a
// skill muda (ex.: após um reset persistido refazer a query).
import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type {
  CampoReset,
  EditorialSkill,
  ModeloGemini,
  UpdateSkillPayload,
} from '@/lib/editorialSkillsApi';

interface Props {
  skill: EditorialSkill;
  /** Sugestões para o campo do modelo Gemini (lista do `agy`). */
  modelosGemini: ModeloGemini[];
  pending: boolean;
  onSave: (payload: UpdateSkillPayload) => void;
  onReset: (campos: CampoReset[]) => void;
  onCancel: () => void;
}

const textareaClasses = cn(
  'flex w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-3 py-2 text-sm text-text-100 placeholder:text-text-400',
  'transition-colors focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-1 focus-visible:ring-accent-500',
);

/** Lentes ⇄ texto (uma por linha), para editar a lista como bloco simples. */
const lentesParaTexto = (lentes: string[]) => lentes.join('\n');
const textoParaLentes = (texto: string) =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

function ResetButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
    >
      <RotateCcw size={12} aria-hidden />
      Resetar para o padrão
    </button>
  );
}

export function EditorialSkillForm({
  skill,
  modelosGemini,
  pending,
  onSave,
  onReset,
  onCancel,
}: Props) {
  const [corpo, setCorpo] = useState(skill.corpo);
  const [modelo, setModelo] = useState(skill.params.modelo);
  const [modeloGemini, setModeloGemini] = useState(skill.params.modelo_gemini);
  const [thinking, setThinking] = useState(String(skill.params.thinking_tokens));
  const [timeout, setTimeout] = useState(String(skill.params.timeout));
  const [lentesText, setLentesText] = useState(lentesParaTexto(skill.lentes));

  // Ressincroniza quando a skill muda (troca de skill ou reset persistido).
  useEffect(() => {
    setCorpo(skill.corpo);
    setModelo(skill.params.modelo);
    setModeloGemini(skill.params.modelo_gemini);
    setThinking(String(skill.params.thinking_tokens));
    setTimeout(String(skill.params.timeout));
    setLentesText(lentesParaTexto(skill.lentes));
  }, [skill]);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    onSave({
      corpo,
      params: {
        modelo: modelo.trim(),
        modelo_gemini: modeloGemini.trim(),
        thinking_tokens: Number(thinking) || 0,
        timeout: Number(timeout) || skill.params_default.timeout,
      },
      lentes: textoParaLentes(lentesText),
    });
  };

  const semLentes = skill.lentes_default.length === 0;

  return (
    <form onSubmit={submeter} className="grid gap-5">
      {/* Corpo do prompt */}
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="skill-corpo">Prompt (expertise editorial)</Label>
          <ResetButton onClick={() => onReset(['corpo'])} disabled={pending} />
        </div>
        <textarea
          id="skill-corpo"
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          rows={14}
          spellCheck={false}
          className={cn(textareaClasses, 'font-mono text-xs leading-relaxed')}
        />
        <p className="text-xs text-[var(--wb-text-dim)]">
          É o corpo injetado no prompt desta etapa para o canal ativo.
        </p>
      </div>

      {/* Params da etapa: um modelo por provider */}
      <fieldset className="grid gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Parâmetros da etapa
          </legend>
          <ResetButton onClick={() => onReset(['params'])} disabled={pending} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="skill-modelo" className="text-xs">
              Modelo Claude
            </Label>
            <Input
              id="skill-modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="opus | sonnet | haiku"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="skill-modelo-gemini" className="text-xs">
              Modelo Gemini
            </Label>
            <Input
              id="skill-modelo-gemini"
              list="skill-modelos-gemini"
              value={modeloGemini}
              onChange={(e) => setModeloGemini(e.target.value)}
              placeholder={skill.params_default.modelo_gemini}
            />
            <datalist id="skill-modelos-gemini">
              {modelosGemini.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="skill-thinking" className="text-xs">
              Thinking tokens
            </Label>
            <Input
              id="skill-thinking"
              type="number"
              min={0}
              value={thinking}
              onChange={(e) => setThinking(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="skill-timeout" className="text-xs">
              Timeout (s)
            </Label>
            <Input
              id="skill-timeout"
              type="number"
              min={1}
              value={timeout}
              onChange={(e) => setTimeout(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-[var(--wb-text-dim)]">
          O botão Claude usa o modelo Claude; o botão Gemini usa o modelo Gemini, pela assinatura
          do Antigravity. Thinking tokens só vale para o Claude; o timeout vale para os dois.
        </p>
      </fieldset>

      {/* Lentes de variação */}
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="skill-lentes">Lentes de variação (uma por linha)</Label>
          <ResetButton onClick={() => onReset(['lentes'])} disabled={pending} />
        </div>
        <textarea
          id="skill-lentes"
          value={lentesText}
          onChange={(e) => setLentesText(e.target.value)}
          rows={4}
          className={cn(textareaClasses, 'text-sm')}
          placeholder={semLentes ? 'Esta etapa não usa lentes por padrão.' : ''}
        />
        <p className="text-xs text-[var(--wb-text-dim)]">
          {semLentes
            ? 'Por design esta etapa não sorteia lentes (consistência / anti-repetição). Deixe vazio salvo intenção explícita.'
            : 'A cada geração uma lente é sorteada para variar o ângulo da saída.'}
        </p>
      </div>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar skill
        </Button>
      </div>
    </form>
  );
}

import { useEffect, useRef } from 'react';
import { copyTextToClipboard } from '@/lib/clipboard';

interface UseAutoCopyPromptOptions {
  enabled: boolean;
  text: string;
  dedupeKey: string;
  onCopied: () => void;
}

export function useAutoCopyPrompt({
  enabled,
  text,
  dedupeKey,
  onCopied,
}: UseAutoCopyPromptOptions): void {
  const copiedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      copiedKey.current = null;
      return;
    }

    const promptText = text.trim();
    if (!promptText) return;

    const key = `${dedupeKey}:${promptText.length}`;
    if (copiedKey.current === key) return;

    copiedKey.current = key;
    void copyTextToClipboard(promptText).then((copied) => {
      if (copied) {
        onCopied();
        return;
      }

      copiedKey.current = null;
    });
  }, [dedupeKey, enabled, onCopied, text]);
}

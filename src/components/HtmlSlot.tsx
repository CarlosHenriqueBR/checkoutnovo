'use client';

import { useEffect, useRef } from 'react';

/**
 * Bloco de HTML livre, definido no painel.
 *
 * O React NÃO executa <script> inserido via dangerouslySetInnerHTML, o que
 * quebraria players de vídeo (VTurb, Panda, YouTube embed com script) e
 * scripts de prova social. Por isso injetamos o HTML na mão e recriamos
 * cada <script> — aí o navegador executa normalmente.
 */
export default function HtmlSlot({ html, className }: { html?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!html) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = html;

    el.querySelectorAll('script').forEach((old) => {
      const s = document.createElement('script');
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
      s.text = old.textContent || '';
      old.replaceWith(s);
    });
  }, [html]);

  if (!html) return null;
  return <div ref={ref} className={className} />;
}

/** CSS livre do painel, aplicado só nesta página. */
export function CustomStyle({ css }: { css?: string }) {
  if (!css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

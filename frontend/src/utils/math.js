import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import 'katex/dist/katex.min.css';

/** Renderiza fórmulas $...$ / $$...$$ dentro de un elemento (renderMathInElement del original). */
export function renderMath(el) {
  if (!el) return;
  try {
    renderMathInElement(el, {
      delimiters: [{ left: '$$', right: '$$', display: false }, { left: '$', right: '$', display: false }],
      throwOnError: false, trust: true, strict: false,
    });
  } catch (e) { console.warn('KaTeX rendering failed:', e); }
}

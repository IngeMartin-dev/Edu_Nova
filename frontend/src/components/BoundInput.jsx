import { useLayoutEffect, useRef } from 'react';

/**
 * Input con la semántica de [value] nativa: el DOM solo se reescribe cuando cambia el valor
 * enlazado (no en cada render), así lo que el usuario escribe no se pisa mientras el modelo no cambie.
 */
export default function BoundInput({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const v = value == null ? '' : String(value);
    if (el && el.value !== v) el.value = v;
  }, [value]);
  return <input ref={ref} defaultValue={value == null ? '' : String(value)} {...props} />;
}

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Capa de modal que se dibuja directamente en <body>, fuera de la página.
 * Así siempre cubre TODA la pantalla (menú lateral y barra superior incluidos)
 * y queda centrada en lo que ve el usuario, sin importar el scroll ni los
 * contenedores (transform, overflow, etc.) que tenga la sección.
 * Conserva la clase de la página (pg-xxx) para que sigan aplicando sus estilos.
 */
export default function Overlay({ className, children, ...props }) {
  const anchor = useRef(null);
  const [scope, setScope] = useState(null);

  useLayoutEffect(() => {
    const host = anchor.current?.closest('[class*="pg-"]');
    const cls = host ? [...host.classList].filter((c) => c.startsWith('pg-')).join(' ') : '';
    setScope(cls);
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {scope !== null && createPortal(
        <div className={scope} style={{ display: 'contents' }}>
          <div className={className} {...props}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
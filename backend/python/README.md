# Generador de PDF (Playwright)

El backend (Node) llama a `playwright_generator.py <entrada.html> <salida.pdf>` para convertir
los boletines (carta vertical) y consolidados (carta horizontal) a PDF.

```bash
pip install -r python/requirements.txt
playwright install chromium
```

Si Python no se llama `python3`/`python` en tu sistema, define `PYTHON_BIN` en `backend/.env`
(por ejemplo `PYTHON_BIN=py` en Windows).

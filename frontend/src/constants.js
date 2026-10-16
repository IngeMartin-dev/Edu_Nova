// Grados y salones usados en toda la plataforma (coinciden con la base de datos).
export const GRADES = Array.from({ length: 11 }, (_, i) => `Grado ${i + 1}º`);
export const CLASS_GROUPS = ['Salon A', 'Salon B'];
export const LEVELS = [
  { value: 'primaria', label: 'Primaria (1º–5º)', min: 1, max: 5 },
  { value: 'secundaria', label: 'Secundaria (6º–9º)', min: 6, max: 9 },
  { value: 'media', label: 'Media (10º–11º)', min: 10, max: 11 },
];

-- =====================================================================
-- EduNova · Datos iniciales (se ejecuta después de schema.sql)
-- Requiere el marcador @teacher_id, que src/utils/initDb.js reemplaza por el id del profesor
-- =====================================================================

-- Configuración del año escolar (fila única, id = 1)
INSERT INTO school_year_config (id, year_end_date, min_passing_grade, current_academic_year)
VALUES (1, make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 11, 30), 3.5, EXTRACT(YEAR FROM CURRENT_DATE)::int);

-- Períodos académicos
INSERT INTO academic_periods (period_number, is_unlocked, description, is_automatic) VALUES
    (1, 1, 'Primer período', 0),
    (2, 1, 'Segundo período', 0),
    (3, 1, 'Tercer período', 0),
    (4, 1, 'Cuarto período', 0);

-- Materias 1) PRIMARIA (12 materias) — grade_min=1, grade_max=5
INSERT INTO subjects (name, code, level, grade_min, grade_max, hours_per_week, credits, type, description, teacher_id) VALUES
('Matemáticas',         'MAT-P', 'primaria', 1, 5, 5, 4, 'core', 'Pensamiento lógico-matemático para primaria.', @teacher_id),
('Lengua Castellana',   'LEN-P', 'primaria', 1, 5, 5, 4, 'core', 'Comprensión y producción de textos para primaria.', @teacher_id),
('Inglés',              'ING-P', 'primaria', 1, 5, 3, 2, 'core', 'Competencias comunicativas básicas en inglés.', @teacher_id),
('Ciencias Naturales',  'CNA-P', 'primaria', 1, 5, 3, 3, 'core', 'Exploración del entorno natural y método científico.', @teacher_id),
('Ciencias Sociales',   'CSO-P', 'primaria', 1, 5, 3, 3, 'core', 'Historia, geografía y formación ciudadana para primaria.', @teacher_id),
('Educación Religiosa', 'EDR-P', 'primaria', 1, 5, 1, 1, 'core', 'Formación religiosa y valores espirituales.', @teacher_id),
('Educación Física',    'EDF-P', 'primaria', 1, 5, 2, 2, 'core', 'Desarrollo motriz y hábitos de vida saludable.', @teacher_id),
('Educación Artística', 'EDA-P', 'primaria', 1, 5, 2, 2, 'core', 'Expresión artística y creativa.', @teacher_id),
('Ética y Valores',     'ETI-P', 'primaria', 1, 5, 1, 1, 'core', 'Formación ética y en valores para primaria.', @teacher_id),
('Tecnología e Informática', 'TEC-P', 'primaria', 1, 5, 2, 2, 'core', 'Introducción a herramientas tecnológicas.', @teacher_id),
('Afrocolombianidad',   'AFR-P', 'primaria', 1, 5, 1, 1, 'core', 'Cultura afrocolombiana e historia para primaria.', @teacher_id),
('Educación Emocional', 'EEM-P', 'primaria', 1, 5, 2, 2, 'core', 'Inteligencia emocional y habilidades socioemocionales.', @teacher_id);

-- Materias 2) BACHILLERATO (18 materias) — grade_min=6, grade_max=9
INSERT INTO subjects (name, code, level, grade_min, grade_max, hours_per_week, credits, type, description, teacher_id) VALUES
('Matemáticas',              'MAT-B', 'bachillerato', 6, 9, 5, 4, 'core', 'Pensamiento lógico-matemático avanzado.', @teacher_id),
('Lengua Castellana',        'LEN-B', 'bachillerato', 6, 9, 5, 4, 'core', 'Comprensión y producción de textos avanzados.', @teacher_id),
('Inglés',                   'ING-B', 'bachillerato', 6, 9, 3, 3, 'core', 'Competencias comunicativas avanzadas en inglés.', @teacher_id),
('Ciencias Sociales',        'CSO-B', 'bachillerato', 6, 9, 3, 3, 'core', 'Historia contemporánea y formación ciudadana.', @teacher_id),
('Biología',                 'BIO-B', 'bachillerato', 6, 9, 3, 3, 'core', 'Seres vivos, ecología y biología celular.', @teacher_id),
('Física',                   'FIS-B', 'bachillerato', 8, 9, 3, 3, 'core', 'Movimiento, energía y fenómenos físicos.', @teacher_id),
('Química',                  'QUI-B', 'bachillerato', 8, 9, 3, 3, 'core', 'Materia, reacciones químicas y química orgánica.', @teacher_id),
('Ciencias Políticas',       'CPI-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Política, Estado y ciudadanía activa.', @teacher_id),
('Educación Religiosa',      'EDR-B', 'bachillerato', 6, 9, 1, 1, 'core', 'Formación religiosa y valores espirituales.', @teacher_id),
('Educación Física',         'EDF-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Competencias motrices y vida saludable.', @teacher_id),
('Educación Artística',      'EDA-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Expresión artística y creativa.', @teacher_id),
('Cátedra de la Paz',        'CPZ-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Educación para la paz y convivencia.', @teacher_id),
('Competencias Ciudadanas',  'CCZ-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Participación ciudadana y democracia.', @teacher_id),
('Afrocolombianidad',        'AFR-B', 'bachillerato', 6, 9, 1, 1, 'core', 'Cultura afrocolombiana e historia.', @teacher_id),
('Tecnología e Informática', 'TEC-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Herramientas tecnológicas y programación básica.', @teacher_id),
('Ética y Valores',          'ETI-B', 'bachillerato', 6, 9, 1, 1, 'core', 'Formación ética y en valores.', @teacher_id),
('Educación Emocional',      'EEM-B', 'bachillerato', 6, 9, 2, 2, 'core', 'Inteligencia emocional para bachillerato.', @teacher_id),
('Emprendimiento',           'EMP-B', 'bachillerato', 8, 9, 2, 2, 'elective', 'Proyectos emprendedores y gestión básica.', @teacher_id);

-- Materias 3) MEDIA (21 materias) — grade_min=10, grade_max=11 · NUNCA se mezclan
--      con las de bachillerato (código propio con sufijo '-M').
INSERT INTO subjects (name, code, level, grade_min, grade_max, hours_per_week, credits, type, description, teacher_id) VALUES
('Matemáticas',              'MAT-M', 'media', 10, 11, 5, 4, 'core', 'Pensamiento lógico-matemático avanzado para Media.', @teacher_id),
('Lengua Castellana',        'LEN-M', 'media', 10, 11, 5, 4, 'core', 'Comprensión y producción de textos para Media.', @teacher_id),
('Inglés',                   'ING-M', 'media', 10, 11, 3, 3, 'core', 'Competencias comunicativas avanzadas en inglés para Media.', @teacher_id),
('Ciencias Sociales',        'CSO-M', 'media', 10, 11, 3, 3, 'core', 'Historia contemporánea y formación ciudadana para Media.', @teacher_id),
('Biología',                 'BIO-M', 'media', 10, 11, 3, 3, 'core', 'Seres vivos, ecología y biología celular para Media.', @teacher_id),
('Física',                   'FIS-M', 'media', 10, 11, 3, 3, 'core', 'Movimiento, energía y fenómenos físicos para Media.', @teacher_id),
('Química',                  'QUI-M', 'media', 10, 11, 3, 3, 'core', 'Materia, reacciones químicas y química orgánica para Media.', @teacher_id),
('Filosofía',                'FIL-M', 'media', 10, 11, 2, 2, 'core', 'Reflexión filosófica y pensamiento crítico para Media.', @teacher_id),
('Estadística',              'EST-M', 'media', 10, 11, 2, 2, 'core', 'Análisis estadístico y probabilidades para Media.', @teacher_id),
('Geometría',                'GEO-M', 'media', 10, 11, 2, 2, 'core', 'Geometría analítica avanzada para Media.', @teacher_id),
('Cálculo',                  'CAL-M', 'media', 10, 11, 2, 2, 'core', 'Introducción al cálculo diferencial para Media.', @teacher_id),
('Educación Religiosa',      'EDR-M', 'media', 10, 11, 1, 1, 'core', 'Formación religiosa y valores espirituales para Media.', @teacher_id),
('Educación Física',         'EDF-M', 'media', 10, 11, 2, 2, 'core', 'Competencias motrices para Media.', @teacher_id),
('Educación Artística',      'EDA-M', 'media', 10, 11, 2, 2, 'core', 'Expresión artística y creativa para Media.', @teacher_id),
('Competencias Ciudadanas',  'CCZ-M', 'media', 10, 11, 2, 2, 'core', 'Participación ciudadana para Media.', @teacher_id),
('Cátedra de la Paz',        'CPZ-M', 'media', 10, 11, 2, 2, 'core', 'Educación para la paz y convivencia para Media.', @teacher_id),
('Tecnología e Informática', 'TEC-M', 'media', 10, 11, 2, 2, 'core', 'Herramientas tecnológicas y competencia digital para Media.', @teacher_id),
('Afrocolombianidad',        'AFR-M', 'media', 10, 11, 1, 1, 'core', 'Cultura afrocolombiana para Media.', @teacher_id),
('Educación Emocional',      'EEM-M', 'media', 10, 11, 2, 2, 'core', 'Inteligencia emocional para Media.', @teacher_id),
('Ciencias Económicas',      'ECO-M', 'media', 10, 11, 2, 2, 'elective', 'Fundamentos de economía y finanzas para Media.', @teacher_id),
('Proyecto de Vida',         'PDV-M', 'media', 10, 11, 1, 1, 'elective', 'Orientación vocacional y proyecto de vida para Media.', @teacher_id);

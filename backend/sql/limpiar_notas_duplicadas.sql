-- Limpia notas duplicadas que solo difieren en mayúsculas (p. ej. "Act1" y "ACT1").
-- Conserva la fila ORIGINAL (la más antigua) con el valor más reciente y borra las demás.
-- Ejecutar una sola vez en el editor SQL de Supabase.
BEGIN;

WITH ranked AS (
  SELECT id, student_id, period, subject_name, LOWER(TRIM(grade_name)) AS k, grade_value, is_evaluation, appreciative, updated_at,
         FIRST_VALUE(id)          OVER (PARTITION BY student_id, period, subject_name, LOWER(TRIM(grade_name)) ORDER BY id) AS keep_id,
         FIRST_VALUE(grade_value) OVER (PARTITION BY student_id, period, subject_name, LOWER(TRIM(grade_name)) ORDER BY updated_at DESC NULLS LAST, id DESC) AS last_value,
         FIRST_VALUE(appreciative) OVER (PARTITION BY student_id, period, subject_name, LOWER(TRIM(grade_name)) ORDER BY updated_at DESC NULLS LAST, id DESC) AS last_appr
    FROM subject_grades
   WHERE grade_name IS NOT NULL
),
dups AS (SELECT * FROM ranked WHERE keep_id <> id)
UPDATE subject_grades sg
   SET grade_value = d.last_value, appreciative = d.last_appr, updated_at = NOW()
  FROM (SELECT DISTINCT keep_id, last_value, last_appr FROM dups) d
 WHERE sg.id = d.keep_id;

DELETE FROM subject_grades sg
 USING (
   SELECT id FROM (
     SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id, period, subject_name, LOWER(TRIM(grade_name)) ORDER BY id) AS keep_id
       FROM subject_grades WHERE grade_name IS NOT NULL
   ) t WHERE t.keep_id <> t.id
 ) x
WHERE sg.id = x.id;

COMMIT;

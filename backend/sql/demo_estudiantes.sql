-- =====================================================================
-- EduNova · Datos de ejemplo: 5 estudiantes por salón (A y B) en Grado 1º a 11º
--   = 110 estudiantes, cada uno con su acudiente enlazado (student_parents + parent_classes)
--   y notas de los 4 períodos en todas las materias de su grado (según la tabla subjects).
--
-- Requisitos: schema.sql y seed.sql ya ejecutados (roles y materias).
-- Se puede ejecutar completo en el editor SQL de Supabase / psql. Es idempotente:
-- si ya existe un usuario "padre_<grado><salón><n>" no lo vuelve a crear.
-- Acudientes: usuario padre_1A1 … padre_11B5   ·   contraseña: Demo2026*
-- =====================================================================
DO $demo$
DECLARE
  nombres   text[] := ARRAY['Sofía','Mateo','Valentina','Santiago','Isabella','Samuel','Mariana','Emmanuel','Camila','Juan','Daniela','Andrés','Laura','Nicolás','Gabriela','Sebastián','Luciana','Tomás','Salomé','David'];
  apellidos text[] := ARRAY['Gómez','Rodríguez','Martínez','Hernández','López','García','Pérez','Sánchez','Ramírez','Torres','Flórez','Castro','Vargas','Mendoza','Ortega','Rojas'];
  salones   text[] := ARRAY['A','B'];
  hash      text := '$2b$12$BnMqjZVm9mFKZOPPubHpv.xu.mwRMUsXKNud2dPjWuO8hnRK1PlDi';
  role_parent bigint;
  g int; sal text; k int; n int := 0;
  uid bigint; sid bigint; ap text; nom text;
  subj record; p int;
  base numeric; a1 numeric; a2 numeric; a3 numeric; ev numeric; nf numeric;
  grade_label text; class_label text;
BEGIN
  SELECT id INTO role_parent FROM roles WHERE name = 'PARENT';
  IF role_parent IS NULL THEN RAISE EXCEPTION 'Falta el rol PARENT: ejecuta antes schema.sql y seed.sql'; END IF;
  PERFORM setseed(0.2026);   -- notas reproducibles

  FOR g IN 1..11 LOOP
    grade_label := 'Grado ' || g || E'º';
    FOREACH sal IN ARRAY salones LOOP
      class_label := 'Salon ' || sal;
      FOR k IN 1..5 LOOP
        n := n + 1;
        CONTINUE WHEN EXISTS (SELECT 1 FROM users WHERE username = 'padre_' || g || sal || k);
        nom := nombres[1 + (n * 7) % array_length(nombres, 1)];
        ap  := apellidos[1 + (n * 3) % array_length(apellidos, 1)] || ' ' || apellidos[1 + (n * 5 + 2) % array_length(apellidos, 1)];

        -- Acudiente
        INSERT INTO users (name, surname, username, mail, password, role_id, enable)
        VALUES ('Acudiente', ap, 'padre_' || g || sal || k, 'padre_' || g || sal || k || '@demo.edunova.co', hash, role_parent, 1)
        RETURNING id INTO uid;

        -- Estudiante
        INSERT INTO students (name, surname, grade, class_group, document_number, active)
        VALUES (nom, ap, grade_label, class_label, (1000000000 + n)::text, 1)
        RETURNING id INTO sid;

        INSERT INTO student_parents (student_id, user_id) VALUES (sid, uid);
        INSERT INTO parent_classes (grade, classroom, user_id) VALUES (grade_label, class_label, uid);

        -- Notas: nivel base del estudiante entre 2.6 y 4.9
        base := 2.6 + random() * 2.3;
        FOR subj IN
          SELECT DISTINCT ON (upper(name)) id, name, teacher_id, hours_per_week
            FROM subjects
           WHERE grade_min <= g AND grade_max >= g
           ORDER BY upper(name), id
        LOOP
          FOR p IN 1..4 LOOP
            a1 := least(5, greatest(1, round((base + (random() - 0.5) * 1.2)::numeric, 1)));
            a2 := least(5, greatest(1, round((base + (random() - 0.5) * 1.2)::numeric, 1)));
            a3 := least(5, greatest(1, round((base + (random() - 0.5) * 1.2)::numeric, 1)));
            ev := least(5, greatest(1, round((base + (random() - 0.5) * 1.4)::numeric, 1)));
            nf := round((((a1 + a2 + a3) / 3.0) * 0.8 + ev * 0.2)::numeric, 2);
            INSERT INTO subject_grades (student_id, teacher_id, subject_name, subject_id, period, grade_name, grade_value, is_evaluation, created_at, updated_at) VALUES
              (sid, subj.teacher_id, subj.name, subj.id, p, 'Act1',        a1, 0, now(), now()),
              (sid, subj.teacher_id, subj.name, subj.id, p, 'Act2',        a2, 0, now(), now()),
              (sid, subj.teacher_id, subj.name, subj.id, p, 'Act3',        a3, 0, now(), now()),
              (sid, subj.teacher_id, subj.name, subj.id, p, 'Evaluación',  ev, 1, now(), now()),
              (sid, subj.teacher_id, subj.name, subj.id, p, 'nFinal',      nf, 0, now(), now());
          END LOOP;
          -- Intensidad horaria y fallas (una vez por materia)
          INSERT INTO subject_grades (student_id, teacher_id, subject_name, subject_id, period, grade_name, grade_value, is_evaluation, created_at, updated_at) VALUES
            (sid, subj.teacher_id, subj.name, subj.id, 1, 'ih',  coalesce(subj.hours_per_week, 2), 0, now(), now()),
            (sid, subj.teacher_id, subj.name, subj.id, 1, 'fa',  floor(random() * 4),              0, now(), now()),
            (sid, subj.teacher_id, subj.name, subj.id, 1, 'faa', floor(random() * 2),              0, now(), now());
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Listo: % estudiantes con acudiente y notas (usuarios padre_1A1 … padre_11B5 / Demo2026*)', n;
END
$demo$;

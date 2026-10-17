-- =====================================================================
-- EduNova · Esquema de base de datos (MySQL 8+)
-- Base de datos: edu_nova
-- Se ejecuta con:  npm run db:init   (o manualmente con el cliente mysql)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Tabla: Role
CREATE TABLE roles (
    id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Tabla: User
CREATE TABLE users (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(100),
    surname               VARCHAR(100),
    username              VARCHAR(100) NOT NULL UNIQUE,
    mail                  VARCHAR(100) NOT NULL UNIQUE,
    password              VARCHAR(255) NOT NULL,
    role_id               BIGINT,
    digital_signature     LONGTEXT,
    profile_picture       VARCHAR(255),
    fcm_token             VARCHAR(512),
    two_factor_enabled    TINYINT(1) DEFAULT 0,
    two_factor_secret     VARCHAR(255),
    temp_2fa_code         VARCHAR(20),
    temp_2fa_expiry       BIGINT,
    enable                TINYINT(1) DEFAULT 1,
    terms_accepted_at     DATETIME NULL,
    privacy_accepted_at   DATETIME NULL,
    additional_admin      TINYINT(1) DEFAULT 0,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- Tabla: Student
CREATE TABLE students (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(100) NOT NULL,
    surname               VARCHAR(100) NOT NULL,
    grade                 VARCHAR(50) NOT NULL,
    class_group           VARCHAR(50),
    previous_grade        VARCHAR(50),
    previous_class_group  VARCHAR(50),
    document_number       VARCHAR(20),
    active                TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- Tabla: Student
CREATE TABLE student_parents (
    student_id BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    PRIMARY KEY (student_id, user_id),
    CONSTRAINT fk_sp_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_sp_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla: Subject
CREATE TABLE subjects (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(20)  NOT NULL,
    level           VARCHAR(50)  NOT NULL,   -- 'primaria' | 'bachillerato' | 'media'
    grade_min       INT,
    grade_max       INT,
    hours_per_week  INT,
    credits         INT,
    type            VARCHAR(20),
    description     VARCHAR(500),
    teacher_id      BIGINT NULL,
    CONSTRAINT fk_subjects_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: SubjectGrade
CREATE TABLE subject_grades (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id    BIGINT,
    teacher_id    BIGINT,
    subject_name  VARCHAR(150) NOT NULL,
    subject_id    BIGINT,
    period        INT NOT NULL,
    grade_name    VARCHAR(100),
    grade_value   DOUBLE,
    is_evaluation TINYINT(1),
    appreciative  VARCHAR(50),
    created_at    DATETIME,
    updated_at    DATETIME,
    CONSTRAINT fk_sg_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_sg_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
    INDEX idx_sg_student_period_subject (student_id, period, subject_name)
) ENGINE=InnoDB;

-- Tabla: ParentClass
CREATE TABLE parent_classes (
    id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    grade     VARCHAR(50) NOT NULL,
    classroom VARCHAR(50) NOT NULL,
    user_id   BIGINT NOT NULL,
    CONSTRAINT fk_pc_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: HomeroomAssignment
CREATE TABLE homeroom_assignments (
    id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    grade     VARCHAR(50) NOT NULL,
    classroom VARCHAR(50) NOT NULL,
    user_id   BIGINT NULL,
    CONSTRAINT uq_homeroom_grade_classroom UNIQUE (grade, classroom),
    CONSTRAINT fk_ha_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: GradeColumnConfig
CREATE TABLE grade_column_configs (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    teacher_id       BIGINT NOT NULL,
    subject_name     VARCHAR(150) NOT NULL,
    grade            VARCHAR(50) NOT NULL,
    classroom        VARCHAR(50) NOT NULL,
    period           INT NOT NULL DEFAULT 1,
    columns_json     TEXT,
    quizzes_pct      INT DEFAULT 0,
    talleres_pct     INT DEFAULT 0,
    actividades_pct  INT DEFAULT 0,
    created_at       DATETIME,
    updated_at       DATETIME,
    CONSTRAINT uq_gcc UNIQUE (teacher_id, subject_name, grade, classroom, period),
    CONSTRAINT fk_gcc_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: Period
CREATE TABLE academic_periods (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    period_number      INT NOT NULL UNIQUE,
    is_unlocked        TINYINT(1) DEFAULT 0,
    start_date         DATETIME,
    end_date           DATETIME,
    unlock_date        DATETIME,
    lock_date          DATETIME,
    description        VARCHAR(255),
    is_automatic       TINYINT(1) DEFAULT 0,
    notified_open_7d   TINYINT(1) DEFAULT 0,
    notified_close_7d  TINYINT(1) DEFAULT 0
) ENGINE=InnoDB;

-- Tabla: SchoolYearConfig
CREATE TABLE school_year_config (
    id                             BIGINT PRIMARY KEY,
    year_end_date                  DATE,
    min_passing_grade              DOUBLE DEFAULT 3.5,
    current_academic_year          INT,
    last_wiped_at                  DATETIME,
    last_advanced_at               DATETIME,
    advance_pending_classroom_org  TINYINT(1) DEFAULT 0,
    year_end_notified              TINYINT(1) DEFAULT 0,
    year_end_7d_notified           TINYINT(1) DEFAULT 0
) ENGINE=InnoDB;

-- Tabla: ReportCard
CREATE TABLE report_cards (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id          BIGINT,
    academic_period     VARCHAR(50),
    grades              LONGTEXT,
    comments            LONGTEXT,
    difficulties        LONGTEXT,
    lost_areas          LONGTEXT,
    pdf_url             VARCHAR(500),
    created_at          DATETIME,
    sent_at             DATETIME,
    teacher_id          BIGINT,
    homeroom_teacher    VARCHAR(150),
    created_by          BIGINT,
    is_signed           TINYINT(1) DEFAULT 0,
    signature_date      DATETIME,
    principal_signature LONGTEXT,
    CONSTRAINT fk_rc_student    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_rc_teacher    FOREIGN KEY (teacher_id) REFERENCES users(id),
    CONSTRAINT fk_rc_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: ReportCardHistory
CREATE TABLE report_card_history (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_card_id     BIGINT,
    event_type         VARCHAR(50),
    event_description  VARCHAR(500),
    event_date         DATETIME,
    user_id            BIGINT,
    CONSTRAINT fk_rch_reportcard FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE,
    CONSTRAINT fk_rch_user       FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: DigitalSignature
CREATE TABLE digital_signatures (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_card_id  BIGINT,
    user_id         BIGINT NOT NULL,
    student_id      BIGINT,
    signature_data  LONGTEXT,
    signed_at       DATETIME,
    ip_address      VARCHAR(64),
    CONSTRAINT fk_ds_reportcard FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE,
    CONSTRAINT fk_ds_user       FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_ds_student    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla: RecoveryPlan
CREATE TABLE recovery_plans (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id     BIGINT,
    teacher_id     BIGINT,
    subject_name   VARCHAR(150) NOT NULL,
    period         INT NOT NULL,
    topics         LONGTEXT,
    plan_content   LONGTEXT,
    duration_days  INT NOT NULL DEFAULT 2,
    day1_content   LONGTEXT,
    day2_content   LONGTEXT,
    created_at     DATETIME,
    CONSTRAINT fk_rp_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: RecoveryData
CREATE TABLE recovery_data (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id            BIGINT,
    teacher_id            BIGINT,
    subject_name          VARCHAR(150) NOT NULL,
    subject_id            BIGINT,
    period                INT NOT NULL,
    recovery_written      DOUBLE,
    recovery_oral         DOUBLE,
    j_integ               VARCHAR(255),
    comp_social           VARCHAR(255),
    valoracion_acudiente  VARCHAR(20),
    created_at            DATETIME,
    updated_at            DATETIME,
    CONSTRAINT fk_rd_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_rd_teacher FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: Notification
CREATE TABLE notifications (
    id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id            BIGINT,
    title              VARCHAR(255) NOT NULL,
    message            LONGTEXT NOT NULL,
    created_at         DATETIME,
    is_read            TINYINT(1) DEFAULT 0,
    notification_type  VARCHAR(50),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla: ChatMessage
CREATE TABLE chat_messages (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_id        BIGINT NOT NULL,
    receiver_id      BIGINT NOT NULL,
    message_type     VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    content          LONGTEXT,
    file_url         VARCHAR(500),
    file_name        VARCHAR(255),
    created_at       DATETIME NOT NULL,
    read_at          DATETIME,
    deleted_for_all  TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT fk_chat_sender   FOREIGN KEY (sender_id)   REFERENCES users(id),
    CONSTRAINT fk_chat_receiver FOREIGN KEY (receiver_id) REFERENCES users(id),
    INDEX idx_chat_sender_receiver (sender_id, receiver_id),
    INDEX idx_chat_receiver_sender (receiver_id, sender_id),
    INDEX idx_chat_created_at (created_at)
) ENGINE=InnoDB;

-- Tabla: RefreshToken
CREATE TABLE refresh_tokens (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    token         VARCHAR(512) NOT NULL,
    user_id       BIGINT NOT NULL,
    expires_at    DATETIME NOT NULL,
    created_at    DATETIME NOT NULL,
    device_info   VARCHAR(255),
    ip_address    VARCHAR(64),
    last_used_at  DATETIME,
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla: Feedback
CREATE TABLE feedback (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT,
    message     VARCHAR(2000) NOT NULL,
    created_at  DATETIME NOT NULL,
    reviewed    TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT fk_fb_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabla: FcmToken
CREATE TABLE fcm_tokens (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    token        VARCHAR(512) NOT NULL,
    device_type  VARCHAR(20),
    device_name  VARCHAR(150),
    created_at   DATETIME,
    last_used    DATETIME,
    is_active    TINYINT(1) DEFAULT 1,
    CONSTRAINT fk_fcm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla: BoletinDraft
CREATE TABLE boletin_drafts (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    grade        VARCHAR(50) NOT NULL,
    classroom    VARCHAR(50) NOT NULL,
    period       INT NOT NULL,
    school_year  VARCHAR(10),
    payload      LONGTEXT NOT NULL,
    created_at   DATETIME,
    updated_at   DATETIME
) ENGINE=InnoDB;


-- Tabla: BoletinValoracion  (valoración del acudiente por estudiante y período)
CREATE TABLE IF NOT EXISTS boletin_valoraciones (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id  BIGINT NOT NULL,
    period      INT NOT NULL,
    nota        DOUBLE NOT NULL,
    updated_at  DATETIME,
    CONSTRAINT uq_bv_student_period UNIQUE (student_id, period)
) ENGINE=InnoDB;

-- Tabla: BoletinObjetivo  (objetivos predeterminados por grado, salón y período)
CREATE TABLE IF NOT EXISTS boletin_objetivos (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    grade       VARCHAR(50) NOT NULL,
    classroom   VARCHAR(50) NOT NULL,
    period      INT NOT NULL,
    payload     TEXT NOT NULL,
    updated_at  DATETIME,
    CONSTRAINT uq_bo_grade_classroom_period UNIQUE (grade, classroom, period)
) ENGINE=InnoDB;

-- Tabla: Promotion  (estudiantes promovidos al cerrar el año escolar)
CREATE TABLE IF NOT EXISTS promotions (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id       BIGINT,
    name             VARCHAR(255),
    surname          VARCHAR(255),
    document_number  VARCHAR(20),
    grade            VARCHAR(255),
    class_group      VARCHAR(255),
    academic_year    INT,
    promoted_at      DATE,
    expires_at       DATE,
    folder           VARCHAR(255)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'subAdmin', 'semesterAdmin', 'teacher', 'student');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('1st', '2nd');

-- CreateEnum
CREATE TYPE "Section" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent');

-- CreateEnum
CREATE TYPE "MarkedBy" AS ENUM ('manual', 'search', 'self');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('friday', 'eid', 'puja', 'national', 'semester_break', 'other');

-- CreateEnum
CREATE TYPE "InviteRole" AS ENUM ('subAdmin', 'semesterAdmin', 'teacher');

-- CreateEnum
CREATE TYPE "PublicRole" AS ENUM ('student', 'teacher');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "technology_code" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "Role" NOT NULL,
    "shift" "Shift",
    "department_id" TEXT,
    "department_code" TEXT,
    "semesters" INTEGER[],
    "semester" INTEGER,
    "section" "Section",
    "subject_id" TEXT,
    "student_id" TEXT,
    "mobile" TEXT,
    "created_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "registered" BOOLEAN NOT NULL DEFAULT true,
    "reg_code" TEXT,
    "reg_code_expire" TIMESTAMP(3),
    "verification_otp" TEXT,
    "verification_expire" TIMESTAMP(3),
    "reset_password_otp" TEXT,
    "reset_password_expire" TIMESTAMP(3),
    "login_otp" TEXT,
    "login_otp_expire" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "section" "Section" NOT NULL,
    "shift" "Shift" NOT NULL,
    "teacher_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "shift" "Shift",
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "total_students" INTEGER NOT NULL DEFAULT 0,
    "present_count" INTEGER NOT NULL DEFAULT 0,
    "is_substitute" BOOLEAN NOT NULL DEFAULT false,
    "substitute_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "scanned_at" TIMESTAMP(3),
    "marked_by" "MarkedBy" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'other',
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'global',
    "attendance_threshold" INTEGER NOT NULL DEFAULT 70,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "role" "InviteRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department_id" TEXT,
    "department_code" TEXT,
    "shift" "Shift",
    "semester" INTEGER,
    "section" "Section",
    "subject_name" TEXT,
    "subject_code" TEXT,
    "invited_by" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "code_expire" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_pre_approvals" (
    "id" TEXT NOT NULL,
    "roll" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "semester" INTEGER NOT NULL,
    "added_by" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "code_expire" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "used_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_pre_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "PublicRole" NOT NULL,
    "shift" "Shift",
    "student_id_text" TEXT,
    "department_id" TEXT,
    "semester" INTEGER,
    "section" TEXT,
    "shadow_student_id" TEXT,
    "mobile" TEXT,
    "otp" TEXT NOT NULL,
    "otp_expire" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ignored_misses" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ignored_by" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ignored_misses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");

-- CreateIndex
CREATE INDEX "users_role_department_id_shift_semester_idx" ON "users"("role", "department_id", "shift", "semester");

-- CreateIndex
CREATE INDEX "users_role_department_id_shift_semester_section_idx" ON "users"("role", "department_id", "shift", "semester", "section");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "subjects_is_active_department_id_shift_semester_idx" ON "subjects"("is_active", "department_id", "shift", "semester");

-- CreateIndex
CREATE INDEX "subjects_teacher_id_idx" ON "subjects"("teacher_id");

-- CreateIndex
CREATE INDEX "sessions_subject_id_date_idx" ON "sessions"("subject_id", "date");

-- CreateIndex
CREATE INDEX "sessions_teacher_id_date_idx" ON "sessions"("teacher_id", "date" DESC);

-- CreateIndex
CREATE INDEX "sessions_status_department_id_semester_section_idx" ON "sessions"("status", "department_id", "semester", "section");

-- CreateIndex
CREATE INDEX "attendances_student_id_date_idx" ON "attendances"("student_id", "date" DESC);

-- CreateIndex
CREATE INDEX "attendances_subject_id_date_idx" ON "attendances"("subject_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "attendances_session_id_student_id_key" ON "attendances"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "holidays_start_date_end_date_idx" ON "holidays"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "admin_invites_email_role_idx" ON "admin_invites"("email", "role");

-- CreateIndex
CREATE UNIQUE INDEX "student_pre_approvals_roll_key" ON "student_pre_approvals"("roll");

-- CreateIndex
CREATE UNIQUE INDEX "student_pre_approvals_email_key" ON "student_pre_approvals"("email");

-- CreateIndex
CREATE INDEX "ignored_misses_date_idx" ON "ignored_misses"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ignored_misses_subject_id_date_key" ON "ignored_misses"("subject_id", "date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_substitute_by_fkey" FOREIGN KEY ("substitute_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pre_approvals" ADD CONSTRAINT "student_pre_approvals_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pre_approvals" ADD CONSTRAINT "student_pre_approvals_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_pre_approvals" ADD CONSTRAINT "student_pre_approvals_used_by_user_id_fkey" FOREIGN KEY ("used_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_shadow_student_id_fkey" FOREIGN KEY ("shadow_student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignored_misses" ADD CONSTRAINT "ignored_misses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ignored_misses" ADD CONSTRAINT "ignored_misses_ignored_by_fkey" FOREIGN KEY ("ignored_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

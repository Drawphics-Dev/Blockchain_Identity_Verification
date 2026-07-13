-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('open', 'waitlist', 'closed');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('tuition', 'accommodation', 'library', 'lab', 'other');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "lecturer" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "seatsTaken" INTEGER NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'open',
    "department" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStatement" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,

    CONSTRAINT "FeeStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeItem" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" "FeeCategory" NOT NULL,

    CONSTRAINT "FeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSet" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "gpa" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ResultSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRecord" (
    "id" TEXT NOT NULL,
    "resultSetId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "gradePoint" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ResultRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentId_key" ON "Student"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_courseCode_semester_key" ON "Enrollment"("studentId", "courseCode", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStatement_studentId_semester_key" ON "FeeStatement"("studentId", "semester");

-- CreateIndex
CREATE INDEX "FeeItem_statementId_idx" ON "FeeItem"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE INDEX "Payment_statementId_idx" ON "Payment"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultSet_studentId_semester_key" ON "ResultSet"("studentId", "semester");

-- CreateIndex
CREATE INDEX "ResultRecord_resultSetId_idx" ON "ResultRecord"("resultSetId");

-- CreateIndex
CREATE INDEX "Session_studentId_idx" ON "Session"("studentId");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStatement" ADD CONSTRAINT "FeeStatement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeItem" ADD CONSTRAINT "FeeItem_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FeeStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "FeeStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSet" ADD CONSTRAINT "ResultSet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRecord" ADD CONSTRAINT "ResultRecord_resultSetId_fkey" FOREIGN KEY ("resultSetId") REFERENCES "ResultSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

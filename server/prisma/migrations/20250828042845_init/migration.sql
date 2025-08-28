-- CreateTable
CREATE TABLE "public"."Profile" (
    "id" SERIAL NOT NULL,
    "profileName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "deskOrgId" TEXT,
    "defaultDepartmentId" TEXT,
    "fromEmailAddress" TEXT,
    "mailReplyAddressId" TEXT,
    "inventoryOrgId" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TicketLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ticketNumber" TEXT,
    "details" TEXT,
    "profileName" TEXT NOT NULL,

    CONSTRAINT "TicketLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_profileName_key" ON "public"."Profile"("profileName");

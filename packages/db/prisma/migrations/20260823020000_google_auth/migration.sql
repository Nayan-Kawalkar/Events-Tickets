-- Google sign-in.
-- An account created through Google has no password, so the column becomes
-- nullable. The password login path treats NULL as "no password login here".
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Google's subject id: stable across email changes, so it is what a returning
-- account is matched on first.
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

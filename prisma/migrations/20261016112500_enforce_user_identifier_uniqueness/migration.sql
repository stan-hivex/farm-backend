CREATE UNIQUE INDEX "users_username_lower_unique"
ON "users" (LOWER("username"));

CREATE UNIQUE INDEX "users_email_lower_unique"
ON "users" (LOWER("email"))
WHERE "email" IS NOT NULL;

CREATE UNIQUE INDEX "users_phone_canonical_unique"
ON "users" (REGEXP_REPLACE("phone", '^\+', ''));

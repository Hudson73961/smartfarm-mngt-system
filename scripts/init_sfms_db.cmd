@echo off
setlocal
set PGPASSWORD=postgres
set "DBNAME=sfms_db"
for /f %%i in ('"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d postgres -w -At -c "SELECT 1 FROM pg_database WHERE datname='sfms_db';"') do set EXISTS=%%i
if not "%EXISTS%"=="1" (
  "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h localhost -U postgres -w sfms_db
)
cd /d e:\Smart_Farmer\backend
npx prisma generate
npx prisma migrate dev --name init
npm run seed:admin

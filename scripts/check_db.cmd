@echo off
setlocal
set PGPASSWORD=postgres
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d postgres -w -At -c "SELECT datname FROM pg_database ORDER BY datname;"

@echo off
setlocal
copy "C:\Program Files\PostgreSQL\18\data\pg_hba.conf" "C:\Program Files\PostgreSQL\18\data\pg_hba.conf.bak" >NUL 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content 'C:\Program Files\PostgreSQL\18\data\pg_hba.conf') -replace 'local   all             all                                     scram-sha-256', 'local   all             all                                     trust' -replace 'host    all             all             127.0.0.1/32            scram-sha-256', 'host    all             all             127.0.0.1/32            trust' -replace 'host    all             all             ::1/128                 scram-sha-256', 'host    all             all             ::1/128                 trust' -replace 'local   replication     all                                     scram-sha-256', 'local   replication     all                                     trust' | Set-Content 'C:\Program Files\PostgreSQL\18\data\pg_hba.conf'"
"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\18\data" -l "C:\Program Files\PostgreSQL\18\data\postgres.log" reload
"C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d postgres -w -c "ALTER USER postgres WITH PASSWORD 'postgres';"
copy "C:\Program Files\PostgreSQL\18\data\pg_hba.conf.bak" "C:\Program Files\PostgreSQL\18\data\pg_hba.conf" >NUL 2>&1
"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\18\data" -l "C:\Program Files\PostgreSQL\18\data\postgres.log" reload

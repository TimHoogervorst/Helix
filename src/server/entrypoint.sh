#!/bin/bash
set -e

echo "Waiting for PostgreSQL to become healthy..."

# Wait for PostgreSQL to accept connections
until python -c "import psycopg2; psycopg2.connect('${DATABASE_URL}')" 2>/dev/null; do
    echo "PostgreSQL is unavailable — sleeping"
    sleep 1
done

echo "PostgreSQL is up — generating and running migrations"
python manage.py makemigrations --noinput
python manage.py migrate --noinput --fake-initial

echo "Running seed data"
python manage.py seed_data

echo "Starting Django dev server"
exec python manage.py runserver 0.0.0.0:8000

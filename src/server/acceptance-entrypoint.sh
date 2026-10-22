#!/bin/sh
# Restart a lifecycle deployment through the ordinary migration hooks without
# generating migrations or reseeding/resetting its retained scientific data.
set -e

echo "Waiting for PostgreSQL before lifecycle startup..."
until python -c "import psycopg2; psycopg2.connect('${DATABASE_URL}')" 2>/dev/null; do
    sleep 1
done

python manage.py migrate --noinput
exec python manage.py runserver 0.0.0.0:8000

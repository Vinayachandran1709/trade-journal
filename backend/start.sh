#!/bin/bash

PYTHON=/usr/bin/python3

echo "==> Python: $($PYTHON --version)"
echo "==> Running database migrations (up to 3 attempts for Neon cold start)"
for i in 1 2 3; do
    if $PYTHON -m alembic upgrade head; then
        echo "==> Migrations OK"
        break
    else
        echo "==> Attempt $i failed. Retrying in 5s..."
        sleep 5
    fi
done

echo "==> Starting uvicorn on port ${PORT:-8000}"
exec $PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

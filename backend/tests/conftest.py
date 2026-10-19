import os

# Settings needs these to import; tests never read real secrets.
os.environ.setdefault("APP_DATABASE_URL", "postgresql://u:p@localhost/app")
os.environ.setdefault("TARGET_DATABASE_URL", "postgresql://analyst_ro:p@localhost/olist")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-0123456789abcdef")
os.environ.setdefault("RLS_SIGNING_SECRET", "test-rls-secret-0123456789abcdef-xyz")

# Container-backed fixtures (target DB, app DB, Redis, runtime, API client). Containers only
# start when a test requests them, so unit runs stay Docker-free.
pytest_plugins = ["tests.fixtures"]

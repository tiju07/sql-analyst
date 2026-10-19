import os

# Settings needs these to import; tests never read real secrets.
os.environ.setdefault("APP_DATABASE_URL", "postgresql://u:p@localhost/app")
os.environ.setdefault("TARGET_DATABASE_URL", "postgresql://analyst_ro:p@localhost/olist")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("RLS_SIGNING_SECRET", "test-rls-secret")

-- Read-only role + fail-closed row-level security. Run as the schema owner after loading.
-- Placeholders {ro_password} and {signing_key} are filled in as quoted literals by load_olist.py.
--
-- Scope travels in the GUC app.allowed_states as "<states>.<hex hmac-sha256(states)>",
-- e.g. "SP.3f1a..." or "*.9b2c...". Policies trust it only if the signature verifies, so SQL
-- that manages to call set_config() still can't widen its own scope: it doesn't know the key.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'analyst_ro') THEN
        CREATE ROLE analyst_ro;
    END IF;
END $$;
ALTER ROLE analyst_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD {ro_password};
-- Backstops in case the app forgets: read-only by default and a hard timeout above the app's.
ALTER ROLE analyst_ro SET default_transaction_read_only = on;
ALTER ROLE analyst_ro SET statement_timeout = '30s';
ALTER ROLE analyst_ro SET idle_in_transaction_session_timeout = '60s';

DO $$
BEGIN
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO analyst_ro', current_database());
END $$;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA olist TO analyst_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA olist TO analyst_ro;

-- Private schema: analyst_ro gets EXECUTE on the policy function but no USAGE on the schema,
-- so its own SQL can't name anything in here (policies resolve the function at creation).
DROP SCHEMA IF EXISTS rls CASCADE;
CREATE SCHEMA rls;
REVOKE ALL ON SCHEMA rls FROM PUBLIC;
CREATE EXTENSION pgcrypto WITH SCHEMA rls;

CREATE TABLE rls.config (
    singleton   boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    signing_key text NOT NULL
);
REVOKE ALL ON rls.config FROM PUBLIC;
INSERT INTO rls.config (signing_key) VALUES ({signing_key});

CREATE FUNCTION rls.allowed_states() RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    raw    text := current_setting('app.allowed_states', true);
    states text := split_part(raw, '.', 1);
    sig    text := split_part(raw, '.', 2);
    key    text;
BEGIN
    IF raw IS NULL OR states = '' OR sig = '' THEN
        RETURN '{}';
    END IF;
    SELECT signing_key INTO key FROM rls.config;
    IF key IS NULL OR sig <> encode(rls.hmac(states, key, 'sha256'), 'hex') THEN
        RETURN '{}';
    END IF;
    RETURN string_to_array(states, ',');
END $$;
REVOKE ALL ON FUNCTION rls.allowed_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rls.allowed_states() TO analyst_ro;

-- Customer-scoped tables. Child tables chain through orders -> customers, so a join can never
-- reach rows the customers policy hides. "(SELECT ...)" makes the check a once-per-query initplan.
ALTER TABLE olist.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_scope ON olist.customers FOR SELECT TO analyst_ro
    USING ((SELECT rls.allowed_states()) && ARRAY[customer_state::text, '*']);

ALTER TABLE olist.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_scope ON olist.orders FOR SELECT TO analyst_ro
    USING (EXISTS (SELECT 1 FROM olist.customers c WHERE c.customer_id = orders.customer_id));

ALTER TABLE olist.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_scope ON olist.order_items FOR SELECT TO analyst_ro
    USING (EXISTS (SELECT 1 FROM olist.orders o WHERE o.order_id = order_items.order_id));

ALTER TABLE olist.order_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_scope ON olist.order_payments FOR SELECT TO analyst_ro
    USING (EXISTS (SELECT 1 FROM olist.orders o WHERE o.order_id = order_payments.order_id));

ALTER TABLE olist.order_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY state_scope ON olist.order_reviews FOR SELECT TO analyst_ro
    USING (EXISTS (SELECT 1 FROM olist.orders o WHERE o.order_id = order_reviews.order_id));

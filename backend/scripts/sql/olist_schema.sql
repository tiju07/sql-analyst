-- Olist target schema. Column names follow the CSVs except the "lenght" typos, fixed for the LLM.
-- Zip code prefixes stay text exactly as in the CSVs (leading zeros were already lost upstream).
DROP SCHEMA IF EXISTS olist CASCADE;
CREATE SCHEMA olist;

CREATE TABLE olist.customers (
    customer_id              text PRIMARY KEY,
    customer_unique_id       text NOT NULL,
    customer_zip_code_prefix text NOT NULL,
    customer_city            text NOT NULL,
    customer_state           char(2) NOT NULL
);
CREATE INDEX ON olist.customers (customer_state);
CREATE INDEX ON olist.customers (customer_unique_id);

CREATE TABLE olist.sellers (
    seller_id              text PRIMARY KEY,
    seller_zip_code_prefix text NOT NULL,
    seller_city            text NOT NULL,
    seller_state           char(2) NOT NULL
);
CREATE INDEX ON olist.sellers (seller_state);

-- No FK from products: the dataset has categories missing from this table.
CREATE TABLE olist.product_category_translation (
    product_category_name         text PRIMARY KEY,
    product_category_name_english text NOT NULL
);

CREATE TABLE olist.products (
    product_id                 text PRIMARY KEY,
    product_category_name      text,
    product_name_length        integer,
    product_description_length integer,
    product_photos_qty         integer,
    product_weight_g           integer,
    product_length_cm          integer,
    product_height_cm          integer,
    product_width_cm           integer
);
CREATE INDEX ON olist.products (product_category_name);

-- Not unique per zip prefix in the source data, hence the surrogate key.
CREATE TABLE olist.geolocation (
    geolocation_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    geolocation_zip_code_prefix text NOT NULL,
    geolocation_lat             double precision NOT NULL,
    geolocation_lng             double precision NOT NULL,
    geolocation_city            text NOT NULL,
    geolocation_state           char(2) NOT NULL
);
CREATE INDEX ON olist.geolocation (geolocation_zip_code_prefix);

CREATE TABLE olist.orders (
    order_id                      text PRIMARY KEY,
    customer_id                   text NOT NULL REFERENCES olist.customers,
    order_status                  text NOT NULL,
    order_purchase_timestamp      timestamp NOT NULL,
    order_approved_at             timestamp,
    order_delivered_carrier_date  timestamp,
    order_delivered_customer_date timestamp,
    order_estimated_delivery_date timestamp NOT NULL
);
CREATE INDEX ON olist.orders (customer_id);
CREATE INDEX ON olist.orders (order_purchase_timestamp);
CREATE INDEX ON olist.orders (order_status);

CREATE TABLE olist.order_items (
    order_id            text NOT NULL REFERENCES olist.orders,
    order_item_id       integer NOT NULL,
    product_id          text NOT NULL REFERENCES olist.products,
    seller_id           text NOT NULL REFERENCES olist.sellers,
    shipping_limit_date timestamp NOT NULL,
    price               numeric(10, 2) NOT NULL,
    freight_value       numeric(10, 2) NOT NULL,
    PRIMARY KEY (order_id, order_item_id)
);
CREATE INDEX ON olist.order_items (product_id);
CREATE INDEX ON olist.order_items (seller_id);

CREATE TABLE olist.order_payments (
    order_id             text NOT NULL REFERENCES olist.orders,
    payment_sequential   integer NOT NULL,
    payment_type         text NOT NULL,
    payment_installments integer NOT NULL,
    payment_value        numeric(10, 2) NOT NULL,
    PRIMARY KEY (order_id, payment_sequential)
);

-- review_id repeats across orders in the source data, so the key is the pair.
CREATE TABLE olist.order_reviews (
    review_id               text NOT NULL,
    order_id                text NOT NULL REFERENCES olist.orders,
    review_score            smallint NOT NULL CHECK (review_score BETWEEN 1 AND 5),
    review_comment_title    text,
    review_comment_message  text,
    review_creation_date    timestamp NOT NULL,
    review_answer_timestamp timestamp NOT NULL,
    PRIMARY KEY (review_id, order_id)
);
CREATE INDEX ON olist.order_reviews (order_id);

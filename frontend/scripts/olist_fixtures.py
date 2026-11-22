"""Compute the aggregates behind the static demo's fixtures from the public Olist CSVs.

Run from the repo root after downloading the CSVs into data/olist/ (see data/olist/README.md):

    python3 frontend/scripts/olist_fixtures.py

It writes frontend/fixtures/olist-aggregates.json. Only aggregates are written (sums, counts,
shares by state, month, category or payment type), never rows. The one exception is
top_sellers_by_gmv, which keeps 8-character prefixes of the dataset's already anonymised seller
hashes; the demo does not display them. Standard library only. The SQL each block mirrors is noted beside it.
"""

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "olist"
OUT = ROOT / "frontend" / "fixtures" / "olist-aggregates.json"


def rows(name: str):
    with open(DATA / name, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


def money(v: float) -> float:
    return round(v, 2)


def main() -> None:
    customers = {r["customer_id"]: r for r in rows("olist_customers_dataset.csv")}
    orders = {r["order_id"]: r for r in rows("olist_orders_dataset.csv")}
    items = list(rows("olist_order_items_dataset.csv"))
    payments = list(rows("olist_order_payments_dataset.csv"))
    products = {r["product_id"]: r for r in rows("olist_products_dataset.csv")}
    translation = {
        r["product_category_name"]: r["product_category_name_english"]
        for r in rows("product_category_name_translation.csv")
    }
    reviews = list(rows("olist_order_reviews_dataset.csv"))
    sellers = list(rows("olist_sellers_dataset.csv"))
    geolocation_count = sum(1 for _ in rows("olist_geolocation_dataset.csv"))

    def state_of(order_id: str) -> str:
        return customers[orders[order_id]["customer_id"]]["customer_state"]

    # SUM(order_items.price) by customer_state, all years
    rev_state: dict[str, float] = defaultdict(float)
    # same, 2018 Q2 (the agent resolves "last quarter" to 2018 Q2, per the semantic layer notes)
    rev_state_q2: dict[str, float] = defaultdict(float)
    # SP only, by month of 2018 (what the SP regional persona sees)
    rev_sp_month: dict[str, float] = defaultdict(float)
    # by English category name, all years
    rev_category: dict[str, float] = defaultdict(float)
    orders_category: dict[str, set[str]] = defaultdict(set)
    for it in items:
        price = float(it["price"])
        o = orders[it["order_id"]]
        st = state_of(it["order_id"])
        ts = o["order_purchase_timestamp"]
        rev_state[st] += price
        if "2018-04-01" <= ts < "2018-07-01":
            rev_state_q2[st] += price
        if st == "SP" and "2018-01-01" <= ts < "2018-09-01":
            rev_sp_month[ts[:7]] += price
        cat = products[it["product_id"]]["product_category_name"]
        name = translation.get(cat, cat or "uncategorised")
        rev_category[name] += price
        orders_category[name].add(it["order_id"])

    # COUNT(DISTINCT order_id) by month, purchases before 2018-09-01
    monthly = Counter(o["order_purchase_timestamp"][:7] for o in orders.values()
                      if o["order_purchase_timestamp"] < "2018-09-01")

    # late delivery rate over delivered orders with a delivery date, overall and by state
    late_total = late_n = 0
    late_by_state: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for o in orders.values():
        if o["order_status"] != "delivered" or not o["order_delivered_customer_date"]:
            continue
        late = o["order_delivered_customer_date"] > o["order_estimated_delivery_date"]
        late_total += late
        late_n += 1
        s = customers[o["customer_id"]]["customer_state"]
        late_by_state[s][0] += late
        late_by_state[s][1] += 1

    # payment share by type
    pay = Counter(p["payment_type"] for p in payments)
    pay_total = sum(pay.values())

    # average review score by month of 2018 (review_creation_date)
    score_month: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for r in reviews:
        m = r["review_creation_date"][:7]
        if "2018-01" <= m <= "2018-08":
            score_month[m][0] += int(r["review_score"])
            score_month[m][1] += 1

    sellers_by_id = {r["seller_id"]: r for r in sellers}
    reviews_by_order: dict[str, list[int]] = defaultdict(list)
    for r in reviews:
        reviews_by_order[r["order_id"]].append(int(r["review_score"]))

    # average order value by month of 2018: SUM(price) / COUNT(DISTINCT order_id)
    aov: dict[str, list] = defaultdict(lambda: [0.0, set()])
    # monthly orders and revenue in 2017
    m2017: dict[str, list] = defaultdict(lambda: [set(), 0.0])
    # GMV (price + freight) by seller
    gmv_seller: dict[str, float] = defaultdict(float)
    # item-level review join by category (order_items -> products, order_reviews on order_id)
    score_cat: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    # SP-only breakdowns for the regional persona
    sp_cat: dict[str, float] = defaultdict(float)
    for it in items:
        o = orders[it["order_id"]]
        ts = o["order_purchase_timestamp"]
        price = float(it["price"])
        if "2018-01-01" <= ts < "2018-09-01":
            aov[ts[:7]][0] += price
            aov[ts[:7]][1].add(it["order_id"])
        if "2017-01-01" <= ts < "2018-01-01":
            m2017[ts[:7]][0].add(it["order_id"])
            m2017[ts[:7]][1] += price
        gmv_seller[it["seller_id"]] += price + float(it["freight_value"])
        cat = products[it["product_id"]]["product_category_name"]
        name = translation.get(cat, cat or "uncategorised")
        for sc in reviews_by_order.get(it["order_id"], []):
            score_cat[name][0] += sc
            score_cat[name][1] += 1
        if state_of(it["order_id"]) == "SP":
            sp_cat[name] += price

    # repeat customers: customer_unique_id with more than one order
    per_unique = Counter(customers[o["customer_id"]]["customer_unique_id"] for o in orders.values())

    # average delivery time in days (delivered orders), by customer state
    days_state: dict[str, list[float]] = defaultdict(lambda: [0.0, 0])
    from datetime import datetime
    fmt = "%Y-%m-%d %H:%M:%S"
    for o in orders.values():
        if o["order_status"] != "delivered" or not o["order_delivered_customer_date"]:
            continue
        d = (datetime.strptime(o["order_delivered_customer_date"], fmt)
             - datetime.strptime(o["order_purchase_timestamp"], fmt)).total_seconds() / 86400
        s = customers[o["customer_id"]]["customer_state"]
        days_state[s][0] += d
        days_state[s][1] += 1

    sp_orders = [o for o in orders.values() if customers[o["customer_id"]]["customer_state"] == "SP"]
    sp_ids = {o["order_id"] for o in sp_orders}
    sp_city = Counter(customers[o["customer_id"]]["customer_city"] for o in sp_orders)
    sp_pay = Counter(p["payment_type"] for p in payments if p["order_id"] in sp_ids)
    sp_pay_total = sum(sp_pay.values())
    sp_score: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for r in reviews:
        m = r["review_creation_date"][:7]
        if r["order_id"] in sp_ids and "2018-01" <= m <= "2018-08":
            sp_score[m][0] += int(r["review_score"])
            sp_score[m][1] += 1

    out = {
        "source": "Brazilian E-Commerce Public Dataset by Olist (Kaggle, CC BY-NC-SA 4.0), aggregates only",
        "row_counts": {
            "customers": len(customers),
            "orders": len(orders),
            "order_items": len(items),
            "order_payments": len(payments),
            "order_reviews": len(reviews),
            "products": len(products),
            "sellers": len(sellers),
            "geolocation": geolocation_count,
            "product_category_translation": len(translation),
        },
        "total_revenue": money(sum(rev_state.values())),
        "revenue_by_state": [[s, money(v)] for s, v in sorted(rev_state.items(), key=lambda x: -x[1])],
        "revenue_by_state_2018_q2": [[s, money(v)] for s, v in sorted(rev_state_q2.items(), key=lambda x: -x[1])],
        "sp_revenue_by_month_2018": [[m, money(v)] for m, v in sorted(rev_sp_month.items())],
        "orders_by_month": [[m, n] for m, n in sorted(monthly.items())],
        "late_delivery_rate": round(late_total / late_n, 4),
        "late_delivery_rate_by_state": sorted(
            ([s, round(a / b, 4), b] for s, (a, b) in late_by_state.items()), key=lambda x: -x[1]
        ),
        "payment_share": [[t, round(n / pay_total, 4)] for t, n in pay.most_common()],
        "revenue_by_category": [
            [c, money(v), len(orders_category[c])] for c, v in sorted(rev_category.items(), key=lambda x: -x[1])[:10]
        ],
        "review_score_by_month_2018": [[m, round(a / b, 2)] for m, (a, b) in sorted(score_month.items())],
        "aov_by_month_2018": [[m, money(v / len(ids))] for m, (v, ids) in sorted(aov.items())],
        "orders_revenue_by_month_2017": [[m, len(ids), money(v)] for m, (ids, v) in sorted(m2017.items())],
        "top_sellers_by_gmv": [
            [sid[:8], sellers_by_id[sid]["seller_state"], money(v)]
            for sid, v in sorted(gmv_seller.items(), key=lambda x: -x[1])[:10]
        ],
        "lowest_review_categories": sorted(
            ([c, round(a / b, 2), b] for c, (a, b) in score_cat.items() if b >= 500), key=lambda x: x[1]
        )[:10],
        "top_review_categories": sorted(
            ([c, round(a / b, 2), b] for c, (a, b) in score_cat.items() if b >= 2000), key=lambda x: -x[1]
        )[:10],
        "unique_customers": len(per_unique),
        "repeat_customers": sum(1 for n in per_unique.values() if n > 1),
        "delivery_days_by_state": sorted(
            ([s, round(a / b, 1), b] for s, (a, b) in days_state.items()), key=lambda x: -x[1]
        ),
        "sp": {
            "orders": len(sp_orders),
            "top_cities_by_orders": sp_city.most_common(10),
            "late_delivery_rate": next(r for s, r, _ in (
                [s, round(a / b, 4), b] for s, (a, b) in late_by_state.items()) if s == "SP"),
            "payment_share": [[t, round(n / sp_pay_total, 4)] for t, n in sp_pay.most_common()],
            "revenue_by_category": [[c, money(v)] for c, v in sorted(sp_cat.items(), key=lambda x: -x[1])[:10]],
            "review_score_by_month_2018": [[m, round(a / b, 2)] for m, (a, b) in sorted(sp_score.items())],
        },
        "order_statuses": [s for s, _ in Counter(o["order_status"] for o in orders.values()).most_common()],
        "top_customer_cities": [c for c, _ in Counter(c["customer_city"] for c in customers.values()).most_common(5)],
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

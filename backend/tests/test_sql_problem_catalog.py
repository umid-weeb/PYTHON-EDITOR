from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.sql_problem_catalog import build_sql_problem_catalog, build_sql_problem_order_map


def test_sql_problem_catalog_has_all_expected_problems() -> None:
    catalog = build_sql_problem_catalog()
    order_map = build_sql_problem_order_map()

    assert len(catalog) == 26
    assert len(order_map) == 26
    assert order_map[catalog[0].slug] == 121
    assert order_map[catalog[-1].slug] == 146

    slugs = {item.slug for item in catalog}
    expected_slugs = {
        "sql-basic-joins-avanslar",
        "sql-basic-joins-havo-harorati-oshishi",
        "sql-basic-joins-id-raqam-almashtirish",
        "sql-basic-joins-mahsulot-savdosi-tahlili",
        "sql-basic-joins-mashinaning-ortacha-ishlash-vaqti",
        "sql-basic-joins-oylik-tranzaksiyalar",
        "sql-basic-joins-puli-yoq-mijoz",
        "sql-basic-joins-sessiya-keldi",
        "sql-basic-joins-tasdiqlash-darajasi",
        "sql-aggregation-forsaj-koramiz",
        "sql-aggregation-loyiha-xodimlari-i",
        "sql-aggregation-ortacha-sotish-bahosi",
        "sql-aggregation-oyin-tahlili-iv",
        "sql-aggregation-sorovlarning-sifati-va-ulushi",
        "sql-aggregation-tanlovda-qatnashganlar",
        "sql-aggregation-uzum-tezkor",
        "sql-grouping-5-kishilik-darslar",
        "sql-grouping-eng-katta-boydoq-son",
        "sql-grouping-mahsulot-sotuvi-tahlili",
        "sql-grouping-millioner-mijozlar",
        "sql-grouping-obunachilar-soni",
        "sql-grouping-songi-bir-oylik-faollik",
        "sql-subqueries-2016-yildagi-investitsiya",
        "sql-subqueries-boshsiz-chavandozlar",
        "sql-subqueries-dost-bolamizmi",
        "sql-subqueries-restoran-rivojlanishi",
    }

    assert slugs == expected_slugs

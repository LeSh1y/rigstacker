from __future__ import annotations

from db import Database, TABLE_MAP


COLUMNS = {
    'recommended_used_price': 'DECIMAL(10,2) NULL',
    'recommended_used_source': 'VARCHAR(50) NULL',
    'recommended_used_offer_id': 'INT NULL',
    'recommended_used_external_id': 'VARCHAR(255) NULL',
    'recommended_used_discount': 'DECIMAL(6,4) NULL',
    'price_updated_at': 'DATETIME NULL',
}


def column_exists(db: Database, table: str, column: str) -> bool:
    row = db.fetchone(
        '''
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        ''',
        (table, column),
    )
    return bool(row and row.get('count'))


def main() -> None:
    db = Database()
    db.connect()
    try:
        for table in dict.fromkeys(TABLE_MAP.values()):
            for column, ddl in COLUMNS.items():
                if column_exists(db, table, column):
                    print(f'{table}.{column} already exists')
                    continue
                db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {ddl}')
                print(f'Added {table}.{column}')
    finally:
        db.disconnect()


if __name__ == '__main__':
    main()

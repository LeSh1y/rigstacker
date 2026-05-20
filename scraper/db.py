import mysql.connector
from config import DB_CONFIG
import json
import logging

TABLE_MAP = {
    'gpu':       'gpus',
    'cpu':       'cpus',
    'mainboard': 'mainboards',
    'ram':       'ram_kits',
    'psu':       'psus',
    'case':      'cases',
    'cooler':    'coolers',
    'storage':   'storage',
}

class Database:
    def __init__(self):
        self.conn = None
        self.cursor = None
        self.offer_lifecycle_columns_verified = False

    def connect(self):
        self.conn   = mysql.connector.connect(**DB_CONFIG)
        self.cursor = self.conn.cursor(dictionary=True)
        print('DB connected')
        self.ensure_offer_lifecycle_columns()

    def disconnect(self):
        if self.cursor: self.cursor.close()
        if self.conn:   self.conn.close()

    def execute(self, query, params=None):
        self.cursor.execute(query, params or ())
        self.conn.commit()
        return self.cursor

    def fetchall(self, query, params=None):
        self.cursor.execute(query, params or ())
        return self.cursor.fetchall()

    def fetchone(self, query, params=None):
        self.cursor.execute(query, params or ())
        return self.cursor.fetchone()

    def ensure_offer_lifecycle_columns(self):
        if self.offer_lifecycle_columns_verified:
            return

        rows = self.fetchall(
            '''
            SELECT COLUMN_NAME
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'offers'
            '''
        )
        existing_columns = {row['COLUMN_NAME'] for row in rows}

        required_columns = (
            ('is_active', 'TINYINT(1) NOT NULL DEFAULT 1'),
            ('inactive_reason', 'VARCHAR(64) NULL'),
            ('inactive_checked_at', 'DATETIME NULL'),
            ('last_seen_at', 'DATETIME NULL'),
            ('shipping_price', 'DECIMAL(10,2) NULL'),
            ('total_price', 'DECIMAL(10,2) NULL'),
            ('shipping_unknown', 'TINYINT(1) NOT NULL DEFAULT 0'),
        )

        for column_name, column_definition in required_columns:
            if column_name in existing_columns:
                continue

            self.execute(f'ALTER TABLE offers ADD COLUMN {column_name} {column_definition}')
            logging.info('Added missing offers.%s', column_name)

        self.offer_lifecycle_columns_verified = True
        logging.info('Offer lifecycle columns verified')

    def get_component(self, component_type, name_fragment):
        table = TABLE_MAP.get(component_type)
        if not table:
            return None
        query = f"SELECT id, name FROM {table} WHERE name LIKE %s AND is_available = 1 LIMIT 1"
        return self.fetchone(query, (f'%{name_fragment}%',))

    def get_component_id(self, component_type, model):
        return self.get_component(component_type, model)

    def get_component_details(self, component_type, component_id):
        table = TABLE_MAP.get(component_type)
        if not table:
            return None
        return self.fetchone(f'SELECT * FROM {table} WHERE id = %s', (component_id,))
    


    def upsert_offer(self, offer: dict):
        self.ensure_offer_lifecycle_columns()
 
        existing = self.fetchone(
            'SELECT id, price_eur FROM offers WHERE source = %s AND external_id = %s',
            (offer['source'], offer['external_id'])
        )

        
        risk_flags_json = json.dumps(offer.get('risk_flags', []))

        if existing:
 
            self.execute('''
                UPDATE offers
                SET price_eur = %s, is_suspicious = %s, risk_flags = %s,
                    shipping_price = %s, total_price = %s, shipping_unknown = %s,
                    last_seen_at = NOW(), is_active = 1,
                    inactive_reason = NULL, inactive_checked_at = NULL
                WHERE id = %s
            ''', (
                offer['price_eur'],
                offer.get('is_suspicious', False),
                risk_flags_json,
                offer.get('shipping_price', None),
                offer.get('total_price', offer.get('price_eur')),
                offer.get('shipping_unknown', False),
                existing['id']
            ))
            offer_id = existing['id']
        else:
             
            self.execute('''
                INSERT INTO offers
                (component_type, component_id, source, external_id, title,
                `condition`, price_eur, url, seller_name, seller_rating,
                shipping_price, total_price, shipping_unknown,
                is_active, inactive_reason, inactive_checked_at,
                is_suspicious, risk_flags, confidence_score, last_seen_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,NULL,NULL,%s,%s,%s,NOW())
            ''', (
                offer['component_type'],
                offer['component_id'],
                offer['source'],
                offer['external_id'],
                offer['title'],
                offer['condition'],
                offer['price_eur'],
                offer.get('url', ''),
                offer.get('seller_name', ''),
                offer.get('seller_rating', None),
                offer.get('shipping_price', None),
                offer.get('total_price', offer.get('price_eur')),
                offer.get('shipping_unknown', False),
                offer.get('is_suspicious', False),
                risk_flags_json,
                offer.get('confidence_score', None),
            ))
            offer_id = self.cursor.lastrowid

         
        self.execute('''
            INSERT INTO price_history
            (offer_id, component_type, component_id, source, `condition`, price_eur)
            VALUES (%s, %s, %s, %s, %s, %s)
        ''', (
            offer_id,
            offer['component_type'],
            offer['component_id'],
            offer['source'],
            offer['condition'],
            offer['price_eur'],
        ))

    def mark_offer_active(self, source, external_id):
        self.ensure_offer_lifecycle_columns()

        self.execute('''
            UPDATE offers
            SET is_active = 1,
                inactive_reason = NULL,
                inactive_checked_at = NULL,
                last_seen_at = NOW()
            WHERE source = %s AND external_id = %s
        ''', (source, external_id))

    def mark_offer_inactive(self, source, external_id, reason):
        self.ensure_offer_lifecycle_columns()

        offer = self.fetchone(
            '''
            SELECT id, component_type, component_id
                 , external_id
            FROM offers
            WHERE source = %s AND external_id = %s
            ''',
            (source, external_id),
        )

        self.execute('''
            UPDATE offers
            SET is_active = 0,
                inactive_reason = %s,
                inactive_checked_at = NOW()
            WHERE source = %s AND external_id = %s
        ''', (reason, source, external_id))

        if offer:
            self._clear_recommendation_refs(offer)

    def get_stale_active_offers(self, source='ebay', older_than_hours=12, limit=100):
        self.ensure_offer_lifecycle_columns()

        return self.fetchall('''
            SELECT id, source, external_id, component_type, component_id, title, url, last_seen_at
            FROM offers
            WHERE source = %s
              AND COALESCE(is_active, 1) = 1
              AND (
                last_seen_at IS NULL
                OR last_seen_at < DATE_SUB(NOW(), INTERVAL %s HOUR)
              )
            ORDER BY last_seen_at ASC
            LIMIT %s
        ''', (source, int(older_than_hours), int(limit)))

    def _clear_recommendation_refs(self, offer):
        table = TABLE_MAP.get(offer.get('component_type'))
        if not table:
            return

        columns = {
            row['COLUMN_NAME']
            for row in self.fetchall(
                '''
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = %s
                ''',
                (table,),
            )
        }

        assignments = []
        params = []

        def add_clear(column, offer_id_column, external_id_column):
            if column not in columns:
                return

            conditions = []
            if offer_id_column in columns:
                conditions.append(f'{offer_id_column} = %s')
                params.append(offer['id'])
            if external_id_column in columns:
                conditions.append(f'{external_id_column} = %s')
                params.append(offer.get('external_id'))

            if conditions:
                assignments.append(
                    f'{column} = CASE WHEN {" OR ".join(conditions)} THEN NULL ELSE {column} END'
                )

        for column in (
            'recommended_new_price',
            'recommended_new_source',
            'recommended_new_offer_id',
            'recommended_new_external_id',
        ):
            add_clear(column, 'recommended_new_offer_id', 'recommended_new_external_id')

        for column in (
            'recommended_used_price',
            'recommended_used_source',
            'recommended_used_discount',
            'recommended_used_offer_id',
            'recommended_used_external_id',
        ):
            add_clear(column, 'recommended_used_offer_id', 'recommended_used_external_id')

        if 'price_updated_at' in columns:
            assignments.append('price_updated_at = NOW()')

        if not assignments:
            return

        params.append(offer['component_id'])
        self.execute(f'UPDATE {table} SET {", ".join(assignments)} WHERE id = %s', tuple(params))

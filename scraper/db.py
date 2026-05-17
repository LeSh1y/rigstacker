import mysql.connector
from config import DB_CONFIG
import json

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

    def connect(self):
        self.conn   = mysql.connector.connect(**DB_CONFIG)
        self.cursor = self.conn.cursor(dictionary=True)
        print('DB connected')

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

    def get_component(self, component_type, name_fragment):
        table = TABLE_MAP.get(component_type)
        if not table:
            return None
        query = f"SELECT id, name FROM {table} WHERE name LIKE %s AND is_available = 1 LIMIT 1"
        return self.fetchone(query, (f'%{name_fragment}%',))

    def get_component_id(self, component_type, model):
        return self.get_component(component_type, model)
    


    def upsert_offer(self, offer: dict):
 
        existing = self.fetchone(
            'SELECT id, price_eur FROM offers WHERE source = %s AND external_id = %s',
            (offer['source'], offer['external_id'])
        )

        
        risk_flags_json = json.dumps(offer.get('risk_flags', []))

        if existing:
 
            self.execute('''
                UPDATE offers
                SET price_eur = %s, is_suspicious = %s, risk_flags = %s,
                    last_seen_at = NOW(), is_active = 1
                WHERE id = %s
            ''', (
                offer['price_eur'],
                offer.get('is_suspicious', False),
                risk_flags_json,
                existing['id']
            ))
            offer_id = existing['id']
        else:
             
            self.execute('''
                INSERT INTO offers
                (component_type, component_id, source, external_id, title,
                `condition`, price_eur, url, seller_name, seller_rating,
                is_active, is_suspicious, risk_flags, confidence_score, last_seen_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,%s,%s,%s,NOW())
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
from dotenv import load_dotenv
import os

load_dotenv()

DB_CONFIG = {
    'host':     os.getenv('DB_HOST', 'localhost'),
    'port':     int(os.getenv('DB_PORT', 3306)),
    'user':     os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME'),
}

EBAY_APP_ID        = os.getenv('EBAY_APP_ID')
EBAY_CERT_ID = os.getenv("EBAY_CERT_ID")
CONFIDENCE_THRESHOLD = 0.70
OVERPRICED_RATIO     = 1.30
SUSPICIOUS_RATIO     = 0.70
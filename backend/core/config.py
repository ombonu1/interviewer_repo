import os
import asyncio
import logging

# ==========================================
# ENTERPRISE PATHING & CONFIG
# ==========================================
# ⚠️ CRITICAL FIX: Because this file is inside the `core/` folder, 
# we have to go UP one directory level to find the true root where main.py lives!
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

SUBMISSIONS_DIR = os.path.join(DATA_DIR, "submissions")
SAVED_DIR = os.path.join(DATA_DIR, "saved_sessions")
EXPORTS_DIR = os.path.join(DATA_DIR, "exports")
APPROVED_DIR = os.path.join(DATA_DIR, "approved_queries")

def setup_directories():
    """Creates all necessary folders on startup if they don't exist."""
    os.makedirs(SUBMISSIONS_DIR, exist_ok=True)
    os.makedirs(SAVED_DIR, exist_ok=True)
    os.makedirs(EXPORTS_DIR, exist_ok=True)
    os.makedirs(APPROVED_DIR, exist_ok=True)

# ==========================================
# GLOBAL STATE & LOCKS
# ==========================================
# Global lock to prevent JSON file corruption from concurrent writes
file_io_lock = asyncio.Lock()

# Ephemeral in-memory database for real-time chat
ephemeral_chat_db = {}
# Temporary storage for audit logs until the user explicitly saves
ephemeral_audit_logs = {}

# ==========================================
# LOGGING
# ==========================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("rdec_backend")
"""
app/database.py
Example Python file with intentional issues
"""

import sqlite3
import subprocess
import pickle
import hashlib

# ISSUE 1: Hardcoded credentials (CRITICAL)
DB_PASSWORD = "supersecretpassword123"
API_KEY = "sk_live_abcdef123456"

# ISSUE 2: SQL Injection (CRITICAL)
def get_user(user_id):
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    
    # VULNERABLE: Direct string concatenation
    query = f"SELECT * FROM users WHERE id = {user_id}"
    
    cursor.execute(query)
    return cursor.fetchone()

# ISSUE 3: Command Injection (CRITICAL)
def process_file(filename):
    # VULNERABLE: shell=True with user input
    cmd = f"cat {filename} | grep password"
    result = subprocess.run(cmd, shell=True, capture_output=True)
    return result.stdout

# ISSUE 4: Insecure Deserialization (CRITICAL)
def load_data(data_bytes):
    # VULNERABLE: pickle.loads without safe deserializer
    return pickle.loads(data_bytes)

# ISSUE 5: Weak password hashing (HIGH)
def hash_password(password):
    # VULNERABLE: MD5 is cryptographically broken
    return hashlib.md5(password.encode()).hexdigest()

# ISSUE 6: High cyclomatic complexity (HIGH)
def validate_user(user):
    if user.get("age"):
        if user["age"] >= 18:
            if user.get("email"):
                if "@" in user["email"]:
                    if user.get("phone"):
                        if len(user["phone"]) > 10:
                            if user.get("address"):
                                if len(user["address"]) > 5:
                                    return True
    return False

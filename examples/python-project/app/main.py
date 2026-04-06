"""
app/main.py
Flask app with security issues
"""

from flask import Flask, request
import yaml

app = Flask(__name__)

# ISSUE 7: Insecure YAML loading (HIGH)
@app.route("/upload", methods=["POST"])
def upload_config():
    config_data = request.data
    # VULNERABLE: yaml.load without safe loader
    config = yaml.load(config_data)
    return {"status": "ok"}

# ISSUE 8: Missing authentication (HIGH)
@app.route("/admin/delete", methods=["POST"])
def delete_user():
    # VULNERABLE: No authentication check!
    user_id = request.args.get("id")
    # Delete user from database
    return {"deleted": user_id}

# ISSUE 9: Empty exception handler (MEDIUM)
@app.route("/api/data")
def get_data():
    try:
        data = fetch_from_external_api()
        return data
    except Exception:
        pass  # VULNERABLE: Silently ignoring errors

if __name__ == "__main__":
    app.run(debug=True)  # VULNERABLE: Debug mode in production

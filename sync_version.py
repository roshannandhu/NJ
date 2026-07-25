import re
import json
import os

root_dir = os.path.dirname(os.path.abspath(__file__))

# 1. Read version from installer.iss
iss_path = os.path.join(root_dir, "installer.iss")
with open(iss_path, "r", encoding="utf-8") as f:
    iss_content = f.read()

match = re.search(r'#define AppVersion "([^"]+)"', iss_content)
if not match:
    print("Could not find AppVersion in installer.iss")
    exit(1)

version = match.group(1)
print(f"Detected version: {version}")

# 2. Write version.json (used by EC2 server)
version_json_path = os.path.join(root_dir, "version.json")
with open(version_json_path, "w", encoding="utf-8") as f:
    json.dump({
        "version": version,
        "url": "http://18.61.159.169:8000/updates/NJ%20India%20Setup.exe"
    }, f, indent=2)

# 3. Write frontend/src/version.js (used by local app)
frontend_version_path = os.path.join(root_dir, "frontend", "src", "version.js")
with open(frontend_version_path, "w", encoding="utf-8") as f:
    f.write(f'// This file is auto-updated by sync_version.py\nexport const LOCAL_VERSION = "{version}";\n')

print("Version synced successfully!")

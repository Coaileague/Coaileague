"""Task 4: Add message respond endpoint — PATCH /api/chat/messages/:messageId/respond."""
import re
BASE = "/home/claude/coaileague-audit"

# Find chatRoutes.ts
import subprocess
r = subprocess.run(['find', 'server/routes', '-name', 'chat*'], capture_output=True, text=True, cwd=BASE)
print("Chat route files:", r.stdout.strip())
PY
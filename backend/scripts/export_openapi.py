"""Write the OpenAPI schema (incl. SSE event models) for frontend type generation."""

import json
import sys
from pathlib import Path

from app.main import app

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
out.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
print(f"Wrote {out}")

"""Memory-safe JSON list responses for the EC2 API.

History rows are already stored as validated JSON strings.  Returning a Python
list makes FastAPI deserialize and then serialize the complete history again,
which briefly holds several copies of a large warranty payload in RAM.  The
production EC2 instance is intentionally small, so stream those existing JSON
objects one at a time while keeping the public response shape unchanged.
"""

from fastapi.responses import StreamingResponse
from sqlalchemy import select

from database import SessionLocal


def stream_json_rows(model, *, order_by=None):
    def generate():
        db = SessionLocal()
        try:
            statement = select(model.data)
            if order_by is not None:
                statement = statement.order_by(order_by)
            rows = db.execute(
                statement.execution_options(stream_results=True, yield_per=25)
            ).scalars()

            yield "["
            first = True
            for raw_json in rows:
                if not first:
                    yield ","
                yield raw_json
                first = False
            yield "]"
        finally:
            db.close()

    return StreamingResponse(generate(), media_type="application/json")

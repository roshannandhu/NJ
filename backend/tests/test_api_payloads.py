"""API response-shape tests for memory-safe EC2 JSON streaming."""

import asyncio
import json

from routers.config import get_config
from routers.quotations import get_quotation, list_quotations
from routers.warranties import get_warranty, list_warranties


async def _stream_body(response):
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
    return b"".join(chunks)


def _json_from_stream(response):
    return json.loads(asyncio.run(_stream_body(response)))


def test_history_lists_keep_the_existing_json_array_shape(seed):
    seed.add_quotation("Q-old", extra={"marker": "old"})
    seed.add_quotation("Q-new", extra={"marker": "new"})
    seed.add_warranty("W-old", "Q-old", extra={"marker": "old"})
    seed.add_warranty("W-new", "Q-new", extra={"marker": "new"})

    quotations = _json_from_stream(list_quotations())
    warranties = _json_from_stream(list_warranties())

    assert {row["id"] for row in quotations} == {"Q-old", "Q-new"}
    assert {row["id"] for row in warranties} == {"W-old", "W-new"}


def test_single_records_and_config_remain_json_objects(seed):
    seed.add_quotation("Q1")
    seed.add_warranty("W1", "Q1")

    assert json.loads(get_quotation("Q1").body)["id"] == "Q1"
    assert json.loads(get_warranty("W1").body)["quotationId"] == "Q1"
    assert "settings" in json.loads(get_config().body)

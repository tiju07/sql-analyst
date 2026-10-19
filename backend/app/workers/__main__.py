"""Worker entrypoint: `python -m app.workers`."""

import asyncio

from arq.worker import run_worker

from app.workers.settings import WorkerSettings

# ponytail: arq 0.25 calls asyncio.get_event_loop(), which raises on Python 3.14 unless a loop is
# set. Drop this file for the `arq` CLI once arq supports 3.14.
asyncio.set_event_loop(asyncio.new_event_loop())
run_worker(WorkerSettings)  # type: ignore[arg-type]  # arq types settings as a dict/class union

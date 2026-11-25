"""Retry the intake with backoff."""
import random
import time


def backoff(attempt: int) -> float:
    """Seconds to wait before the next attempt, with jitter."""
    return min(30.0, 2 ** attempt) * (0.5 + random.random() / 2)


def run_with_retry(run, attempts: int = 3):
    for attempt in range(1, attempts + 1):
        try:
            return run()
        except TimeoutError:
            if attempt == attempts:
                raise
            time.sleep(backoff(attempt))

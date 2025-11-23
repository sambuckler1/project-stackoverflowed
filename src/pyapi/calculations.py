# calculations.py
from random import random

# Store computed results in memory (simple example)
computed_data = {}

def perform_heavy_computation():
    """Simulate doing a lot of data work."""
    global computed_data
    print("Performing heavy computations...")
    results = {
        "metricA": random() * 100,
        "metricB": random() * 50,
        "trend": [random() for _ in range(5)]
    }
    computed_data = results
    return results

def get_results():
    """Return cached data if available."""
    return computed_data if computed_data else {"error": "No data computed yet"}

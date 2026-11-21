from .terrain import TerrainAnalysis


def detect_hazards(analysis: TerrainAnalysis) -> dict:
    counts: dict[str, int] = {}
    for hazard in analysis.hazards:
        counts[hazard["type"]] = counts.get(hazard["type"], 0) + 1
    return {
        "hazards": analysis.hazards,
        "counts_by_type": counts,
        "summary": analysis.summary,
        "method": "Transparent elevation-grid rules (slope, local roughness and local relief). Not a trained or validated lunar object detector.",
    }

from __future__ import annotations
from datetime import datetime, timezone
from io import BytesIO, StringIO
import csv


def build_report(mission: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": "LUNA-SAFE 2.0",
        "data_source": mission.get("data_source", "Synthetic demonstration terrain"),
        "terrain_is_synthetic": bool(mission.get("terrain_is_synthetic", True)),
        "configuration": mission.get("configuration", {}),
        "selected_route": mission.get("selected_route", {}),
        "route_comparison": mission.get("route_comparison", []),
        "hazards": mission.get("hazards", []),
        "limitations": [
            "Synthetic terrain is a deterministic demonstration grid, not measured lunar elevation.",
            "Risk and slope thresholds are configurable demo assumptions, not validated rover safety standards.",
            "Energy values are relative model units, not physical watt-hours or a validated power model.",
            "NASA APOD imagery is not a georeferenced terrain dataset.",
            "The rover simulation does not control real hardware.",
        ],
    }


def csv_bytes(report: dict) -> bytes:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["LUNA-SAFE 2.0 Mission Report"])
    writer.writerow(["Generated at", report["generated_at"]])
    writer.writerow(["Terrain source", report["data_source"]])
    writer.writerow(["Synthetic terrain", report["terrain_is_synthetic"]])
    writer.writerow([])
    writer.writerow(["Route strategy", "Available", "Distance (cells)", "Mean risk", "Mean slope (deg)", "Relative energy", "Waypoints", "Safety score"])
    for item in report.get("route_comparison", []):
        metrics = item.get("metrics", {})
        writer.writerow([item.get("mode"), metrics.get("available"), metrics.get("distance_cells"), metrics.get("mean_risk"), metrics.get("mean_slope_deg"), metrics.get("energy"), metrics.get("waypoints"), metrics.get("safety_score")])
    writer.writerow([])
    writer.writerow(["Hazard type", "Row", "Column", "Severity", "Risk", "Explanation"])
    for hazard in report.get("hazards", []):
        writer.writerow([hazard.get("type"), hazard.get("row"), hazard.get("col"), hazard.get("severity"), hazard.get("risk"), hazard.get("explanation")])
    writer.writerow([])
    writer.writerow(["Limitations"])
    for limitation in report.get("limitations", []):
        writer.writerow([limitation])
    return output.getvalue().encode("utf-8")


def pdf_bytes(report: dict) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    except ImportError as exc:
        raise RuntimeError("PDF export requires reportlab. Install backend/requirements.txt and retry.") from exc

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=38, leftMargin=38, topMargin=38, bottomMargin=38)
    styles = getSampleStyleSheet()
    story = [Paragraph("LUNA-SAFE 2.0 — Mission Report", styles["Title"]),
             Paragraph(f"Generated: {report['generated_at']}", styles["Normal"]),
             Paragraph(f"Terrain source: {report['data_source']}", styles["Normal"]),
             Paragraph(f"Terrain is synthetic: {report['terrain_is_synthetic']}", styles["Normal"]), Spacer(1, 14),
             Paragraph("Route comparison", styles["Heading2"])]
    rows = [["Strategy", "Distance", "Risk", "Slope°", "Energy", "Safety"]]
    for item in report.get("route_comparison", []):
        m = item.get("metrics", {})
        rows.append([item.get("mode", "—"), str(m.get("distance_cells", "—")), str(m.get("mean_risk", "—")), str(m.get("mean_slope_deg", "—")), str(m.get("energy", "—")), str(m.get("safety_score", "—"))])
    table = Table(rows, repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#173650")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9aa9b5")), ("FONTSIZE", (0, 0), (-1, -1), 8), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#edf3f7")])]))
    story.extend([table, Spacer(1, 14), Paragraph("Detected hazards", styles["Heading2"])])
    for hazard in report.get("hazards", [])[:25]:
        story.append(Paragraph(f"{hazard['type']} at ({hazard['row']}, {hazard['col']}) — {hazard['severity']}: {hazard['explanation']}", styles["BodyText"]))
    story.extend([Spacer(1, 12), Paragraph("Limitations", styles["Heading2"])])
    for limitation in report.get("limitations", []):
        story.append(Paragraph(f"• {limitation}", styles["BodyText"]))
    doc.build(story)
    return buffer.getvalue()

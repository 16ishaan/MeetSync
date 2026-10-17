"""Paginated, escaped PDF export of reviewed meeting minutes."""
from io import BytesIO
import reportlab
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from minutes import Minutes


def render_minutes_pdf(minutes: Minutes) -> bytes:
    regular = Path(reportlab.__file__).parent / "fonts" / "Vera.ttf"
    bold = Path(reportlab.__file__).parent / "fonts" / "VeraBd.ttf"
    if "MeetSync" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("MeetSync", str(regular)))
        pdfmetrics.registerFont(TTFont("MeetSyncBold", str(bold)))
    font = pdfmetrics.getFont("MeetSync")
    # Refuse corrupt exports instead of silently turning unsupported scripts into squares.
    text = minutes.model_dump_json(ensure_ascii=False)
    unsupported = [c for c in text if ord(c) > 127 and not c.isspace() and ord(c) not in font.face.charToGlyph]
    if unsupported:
        raise ValueError("The PDF font does not support some characters in these minutes. Export an English version or remove unsupported symbols.")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="MBody", fontName="MeetSync", fontSize=9, leading=15, textColor=colors.HexColor("#30384b"), spaceAfter=7, wordWrap="CJK"))
    styles.add(ParagraphStyle(name="MTitle", parent=styles["MBody"], fontName="MeetSyncBold", fontSize=24, leading=30, spaceAfter=16))
    styles.add(ParagraphStyle(name="MHeading", parent=styles["MBody"], fontName="MeetSyncBold", fontSize=12, leading=18, spaceBefore=16, spaceAfter=9, keepWithNext=True))
    def para(value, style="MBody"):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), styles[style])
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=(210*mm, 297*mm), rightMargin=19*mm, leftMargin=19*mm, topMargin=23*mm, bottomMargin=22*mm, title=minutes.title, author="MeetSync")
    story = [para("MINUTES OF MEETING", "MHeading"), para(minutes.title, "MTitle"), para(f"Date: {minutes.date or 'Not specified'}"), para(f"Attendees: {minutes.attendees or 'Not specified'}"), para(minutes.notice), Spacer(1, 5*mm)]
    for title, items in [("Summary", [minutes.summary] if minutes.summary else []), ("Discussion", minutes.discussion), ("Decisions", minutes.decisions)]:
        story.append(para(title, "MHeading"))
        story.extend(para(f"{i + 1}. {item}") for i, item in enumerate(items))
        if not items: story.append(para("None recorded."))
    story.append(para("Action items", "MHeading"))
    if minutes.actions:
        rows = [[para("Task"), para("Owner"), para("Due")]]
        rows += [[para(a.task), para(a.owner or "Not specified"), para(a.due or "Not specified")] for a in minutes.actions]
        table = Table(rows, colWidths=[104*mm, 34*mm, 34*mm], repeatRows=1, splitInRow=1, hAlign=TA_LEFT)
        table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#ece9ff")), ("VALIGN", (0,0), (-1,-1), "TOP"), ("LINEBELOW", (0,0), (-1,-1), .4, colors.HexColor("#dddded")), ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7), ("TOPPADDING", (0,0), (-1,-1), 8)]))
        story.append(table)
    else: story.append(para("None recorded."))
    story.append(para("Next steps", "MHeading"))
    story.extend(para(f"{i+1}. {item}") for i, item in enumerate(minutes.next_steps))
    if not minutes.next_steps: story.append(para("None recorded."))
    def footer(canvas, document):
        canvas.setStrokeColor(colors.HexColor("#ddd9ea"))
        canvas.line(19*mm, 17*mm, 191*mm, 17*mm)
        canvas.setFont("MeetSync", 8)
        canvas.drawString(19*mm, 12*mm, "MeetSync | Review before sharing")
        canvas.drawRightString(191*mm, 12*mm, str(document.page))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()

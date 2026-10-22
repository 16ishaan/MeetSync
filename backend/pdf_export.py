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
    paper, ink, gold, line, card = [colors.HexColor(c) for c in ['#faf8f1','#211d29','#a77832','#ded6bf','#f1ecd9']]
    title_font = 'Times-Bold'
    georgia = Path('C:/Windows/Fonts/georgiab.ttf')
    if georgia.is_file():
        if 'MeetSyncSerif' not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont('MeetSyncSerif', str(georgia)))
        title_font = 'MeetSyncSerif'
    if any(ord(c) > 255 for c in minutes.title):
        title_font = 'MeetSyncBold'
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="MBody", fontName="MeetSync", fontSize=9.3, leading=15.5, textColor=ink, spaceAfter=7, wordWrap="CJK"))
    styles.add(ParagraphStyle(name="MTitle", parent=styles["MBody"], fontName=title_font, fontSize=25, leading=32, spaceAfter=15))
    styles.add(ParagraphStyle(name="MHeading", parent=styles["MBody"], fontName="MeetSyncBold", textColor=gold, fontSize=9, leading=14, spaceBefore=18, spaceAfter=11, keepWithNext=True))
    styles.add(ParagraphStyle(name="MMuted", parent=styles['MBody'], fontSize=8, leading=12, textColor=colors.HexColor('#777264')))
    styles.add(ParagraphStyle(name="MTask", parent=styles['MBody'], fontName='MeetSyncBold', fontSize=9, leading=14, spaceAfter=0))
    styles.add(ParagraphStyle(name="MDue", parent=styles['MMuted'], textColor=gold, fontSize=8, leading=12, spaceAfter=0))
    styles.add(ParagraphStyle(name="MNumber", parent=styles['MBody'], fontName='Times-Italic', textColor=gold, fontSize=12))
    def para(value, style="MBody"):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), styles[style])
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=(210*mm, 297*mm), rightMargin=15*mm, leftMargin=15*mm, topMargin=15*mm, bottomMargin=22*mm, title=minutes.title, author="MeetSync")
    # Frame padding leaves 176 mm of usable content inside the 180 mm margins.
    content_width = doc.width - 12
    date = minutes.date or 'Not specified'
    try:
        from datetime import date as calendar_date
        date = calendar_date.fromisoformat(date).strftime('%d %b %Y')
    except ValueError:
        pass
    header = Table([[para('MINUTES OF MEETING', 'MHeading'), para(f'Date   {date}', 'MMuted')]], colWidths=[content_width*.72, content_width*.28])
    header.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
    story = [header, Spacer(1, 4*mm), para(minutes.title,'MTitle')]
    divider = Table([['']], colWidths=[content_width], rowHeights=[1])
    divider.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,-1),.5,line)]))
    story.extend([divider, Spacer(1,7*mm),para(f"ATTENDEES    {minutes.attendees or 'Not specified'}",'MMuted')])
    def numbered(title, items):
        story.append(para(title.upper(),'MHeading'))
        if not items:
            story.append(para('None recorded.','MMuted'))
        for i,item in enumerate(items):
            row=Table([[para(f'{i+1:02d}','MNumber'),para(item)]],colWidths=[10*mm,content_width-10*mm],splitInRow=1)
            row.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,line),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LEFTPADDING',(0,0),(0,0),0)]))
            story.append(row)
    story.extend([para('SUMMARY','MHeading'),para(minutes.summary or 'None recorded.')])
    numbered('Key decisions',minutes.decisions)
    story.append(para("ACTION ITEMS", "MHeading"))
    if minutes.actions:
        for action in minutes.actions:
            due = action.due or 'Not specified'
            due = 'Due not set' if due == 'Not specified' else due if due.lower().startswith('due') else f'Due {due}'
            table = Table([[para(action.task,'MTask'),para(action.owner or 'Not specified','MMuted'),para(due,'MDue')]],colWidths=[content_width*.57,content_width*.25,content_width*.18],splitInRow=1,cornerRadii=[7,7,7,7],hAlign=TA_LEFT)
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),card),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),11)]))
            story.extend([table,Spacer(1,3*mm)])
    else: story.append(para("None recorded."))
    if minutes.discussion: numbered('Discussion',minutes.discussion)
    numbered('Next steps',minutes.next_steps)
    if minutes.notice: story.extend([para('DRAFT NOTE','MHeading'),para(minutes.notice,'MMuted')])
    def footer(canvas, document):
        canvas.saveState()
        canvas.setFillColor(paper); canvas.rect(0,0,210*mm,297*mm,fill=1,stroke=0)
        canvas.setStrokeColor(line)
        canvas.line(17*mm, 17*mm, 193*mm, 17*mm)
        canvas.setFont("MeetSync", 8)
        canvas.setFillColor(colors.HexColor('#777264'))
        canvas.drawString(17*mm, 12*mm, "MEETSYNC / MINUTES OF MEETING")
        canvas.drawRightString(193*mm, 12*mm, f'Review before sharing  |  {document.page}')
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()

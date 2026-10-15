/**
 * pdfExport.js
 * Generates a branded PDF from a meeting's MoM data.
 * Uses jsPDF with manual layout for full control.
 */

import { jsPDF } from 'jspdf';

const BRAND_COLOR = [110, 91, 255]; // #6e5bff signal purple
const DARK_BG = [20, 23, 31];
const TEXT_COLOR = [220, 215, 200];
const MUTED_COLOR = [150, 155, 175];
const ACCENT_COLOR = [226, 166, 59]; // amber

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

function rgb(arr) {
  return { r: arr[0], g: arr[1], b: arr[2] };
}

function setFontColor(doc, color) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function writeLine(doc, text, x, y, options = {}) {
  const { maxWidth, fontSize = 11, fontStyle = 'normal', color = TEXT_COLOR, lineHeight = 6 } = options;
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', fontStyle);
  setFontColor(doc, color);
  const lines = doc.splitTextToSize(text || '', maxWidth || CONTENT_W);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawSection(doc, title, y) {
  if (y > PAGE_H - 40) {
    doc.addPage();
    y = MARGIN;
  }
  // Section bar
  doc.setFillColor(BRAND_COLOR[0], BRAND_COLOR[1], BRAND_COLOR[2]);
  doc.setGState(new doc.GState({ opacity: 0.15 }));
  doc.rect(MARGIN - 2, y - 4, CONTENT_W + 4, 9, 'F');
  doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_COLOR[0], BRAND_COLOR[1], BRAND_COLOR[2]);
  doc.text(title.toUpperCase(), MARGIN, y + 2);
  return y + 10;
}

function checkPage(doc, y, needed = 20) {
  if (y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

export function exportMeetingPDF(meeting) {
  if (!meeting) throw new Error('No meeting data provided for export.');

  const mom = meeting.mom_data || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Cover header ─────────────────────────────────────────────────
  doc.setFillColor(DARK_BG[0], DARK_BG[1], DARK_BG[2]);
  doc.rect(0, 0, PAGE_W, 52, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_COLOR[0], BRAND_COLOR[1], BRAND_COLOR[2]);
  doc.text('MEETSYNC', MARGIN, 16);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 215, 200);
  const titleText = mom.title || meeting.title || 'Meeting Summary';
  const titleLines = doc.splitTextToSize(titleText, CONTENT_W);
  doc.text(titleLines, MARGIN, 28);

  let y = 52 + titleLines.length * 4;

  // Meta row
  const metaParts = [];
  if (mom.date || meeting.started_at) {
    metaParts.push(
      new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(mom.date || meeting.started_at))
    );
  }
  if (mom.duration || meeting.duration_ms) {
    const ms = meeting.duration_ms || 0;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    metaParts.push(`${mins}m ${secs}s`);
  }
  if (metaParts.length) {
    y = writeLine(doc, metaParts.join('  ·  '), MARGIN, y + 4, {
      fontSize: 9,
      color: MUTED_COLOR,
    });
  }

  y += 8;

  // ── Executive Summary ────────────────────────────────────────────
  if (mom.summary || mom.executive_summary) {
    y = drawSection(doc, 'Executive Summary', y);
    y = writeLine(doc, mom.summary || mom.executive_summary, MARGIN, y, {
      maxWidth: CONTENT_W, fontSize: 10, lineHeight: 5.5, color: TEXT_COLOR,
    });
    y += 8;
  }

  // ── Meeting Overview ─────────────────────────────────────────────
  if (mom.overview) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Overview', y);
    y = writeLine(doc, mom.overview, MARGIN, y, {
      maxWidth: CONTENT_W, fontSize: 10, lineHeight: 5.5, color: TEXT_COLOR,
    });
    y += 8;
  }

  // ── Discussion Points ────────────────────────────────────────────
  const points = mom.discussion_points || mom.main_discussion_points || [];
  if (points.length) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Discussion Points', y);
    for (const point of points) {
      y = checkPage(doc, y, 12);
      const text = typeof point === 'string' ? point : point.point || point.text || JSON.stringify(point);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2]);
      doc.text('•', MARGIN, y);
      doc.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
      const pLines = doc.splitTextToSize(text, CONTENT_W - 6);
      doc.text(pLines, MARGIN + 6, y);
      y += pLines.length * 5.5 + 2;
    }
    y += 6;
  }

  // ── Decisions ────────────────────────────────────────────────────
  const decisions = mom.decisions || mom.important_decisions || [];
  if (decisions.length) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Decisions Made', y);
    for (const d of decisions) {
      y = checkPage(doc, y, 12);
      const text = typeof d === 'string' ? d : d.decision || d.text || JSON.stringify(d);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110, 200, 130);
      doc.text('✓', MARGIN, y);
      doc.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
      const dLines = doc.splitTextToSize(text, CONTENT_W - 6);
      doc.text(dLines, MARGIN + 6, y);
      y += dLines.length * 5.5 + 2;
    }
    y += 6;
  }

  // ── Action Items ─────────────────────────────────────────────────
  const actions = mom.action_items || [];
  if (actions.length) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Action Items', y);

    for (const item of actions) {
      y = checkPage(doc, y, 18);
      const title = item.title || item.task || 'Untitled';
      const assignee = item.assignee || item.assigned_to || 'Unassigned';
      const deadline = item.deadline || item.due_date || 'Unspecified';
      const priority = item.priority || 'medium';

      // Priority badge color
      const pColor = priority === 'high' ? [220, 80, 70] : priority === 'low' ? [80, 160, 130] : [150, 120, 220];
      doc.setFillColor(...pColor);
      doc.roundedRect(MARGIN, y - 3, 14, 5, 2, 2, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(priority.toUpperCase(), MARGIN + 7, y + 0.5, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
      const titleLines = doc.splitTextToSize(title, CONTENT_W - 20);
      doc.text(titleLines, MARGIN + 18, y);
      y += titleLines.length * 5.5 + 1;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(MUTED_COLOR[0], MUTED_COLOR[1], MUTED_COLOR[2]);
      doc.text(`Assignee: ${assignee}   Deadline: ${deadline}`, MARGIN + 18, y);
      y += 5;

      if (item.description) {
        doc.setFontSize(8.5);
        doc.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
        const descLines = doc.splitTextToSize(item.description, CONTENT_W - 20);
        doc.text(descLines, MARGIN + 18, y);
        y += descLines.length * 4.5;
      }
      y += 4;

      // Divider
      doc.setDrawColor(60, 65, 80);
      doc.line(MARGIN, y - 1, MARGIN + CONTENT_W, y - 1);
      y += 3;
    }
    y += 4;
  }

  // ── Unresolved Questions ─────────────────────────────────────────
  const unresolved = mom.unresolved_questions || mom.open_questions || [];
  if (unresolved.length) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Unresolved Questions', y);
    for (const q of unresolved) {
      y = checkPage(doc, y, 10);
      const text = typeof q === 'string' ? q : q.question || JSON.stringify(q);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2]);
      doc.text('?', MARGIN, y);
      doc.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);
      const qLines = doc.splitTextToSize(text, CONTENT_W - 6);
      doc.text(qLines, MARGIN + 6, y);
      y += qLines.length * 5.5 + 2;
    }
    y += 6;
  }

  // ── Transcript ───────────────────────────────────────────────────
  if (meeting.transcript) {
    y = checkPage(doc, y);
    y = drawSection(doc, 'Full Transcript', y);
    y = writeLine(doc, meeting.transcript, MARGIN, y, {
      maxWidth: CONTENT_W, fontSize: 8.5, lineHeight: 4.8, color: MUTED_COLOR,
    });
  }

  // ── Footer on all pages ──────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED_COLOR[0], MUTED_COLOR[1], MUTED_COLOR[2]);
    doc.text(`Generated by MeetSync  ·  Page ${p} of ${totalPages}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' });
    doc.setDrawColor(50, 55, 70);
    doc.line(MARGIN, PAGE_H - 11, PAGE_W - MARGIN, PAGE_H - 11);
  }

  // Download
  const safeTitle = (meeting.title || 'meeting').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'meeting';
  doc.save(`meetsync-${safeTitle}.pdf`);
}

// Render using device fonts so multilingual text is preserved as page images.
import { PDF_PAGE, renderMinutesPages } from './minutesPdfLayout.js';

export async function buildMinutesPdf(minutes, createCanvas = () => document.createElement('canvas')) {
  const { jsPDF } = await import('jspdf');
  if (typeof document !== 'undefined') await document.fonts?.ready;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: minutes.title || 'Meeting minutes', author: 'MeetSync' });
  const canvas = createCanvas();
  canvas.width = PDF_PAGE.width;
  canvas.height = PDF_PAGE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PDF rendering is unavailable in this browser.');
  renderMinutesPages(ctx, minutes, page => {
    if (page) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, `page-${page}`, 'FAST');
  });
  return pdf;
}

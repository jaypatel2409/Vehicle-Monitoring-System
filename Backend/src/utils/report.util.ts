import { query } from '../config/db';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

export interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  category?: 'SEZ' | 'KC';
  direction?: 'IN' | 'OUT';
  gateName?: string;
  vehicleNumber?: string;
}

/**
 * Format a Date as IST in the canonical display format:
 * "25 Mar 2026, 09:18:44 am"
 * This matches VehicleTable, VehicleMonitoring, and Reports page.
 */
function toIST(date: Date): string {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Map vehicleType code to display label.
 * 1001 → Four-Wheeler, 7 → ignored upstream, else → Unknown
 */
function resolveVehicleTypeLabel(raw: string | null | undefined): string {
  const code = String(raw ?? '').trim();
  if (code === '1001') return 'Four-Wheeler';
  if (code === '7')    return 'Unknown'; // two-wheelers filtered before export, safety fallback
  if (!code)           return 'Unknown';
  return 'Unknown';
}

/**
 * Fetch report data from database with all required columns.
 */
async function getReportData(filters: ReportFilters) {
  let sql = `
    SELECT
      ve.id,
      ve.vehicle_number,
      ve.vehicle_type,
      ve.category,
      ve.direction,
      ve.event_time,
      ve.gate_name,
      ve.camera_name,
      ve.camera_index_code,
      v.owner_name
    FROM vehicle_events ve
    LEFT JOIN vehicles v ON ve.vehicle_number = v.vehicle_number
    WHERE 1=1
      AND COALESCE(ve.vehicle_type, '') <> '7'
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.startDate) {
    sql += ` AND ve.event_time >= $${paramIndex}`;
    params.push(filters.startDate);
    paramIndex++;
  }
  if (filters.endDate) {
    sql += ` AND ve.event_time < $${paramIndex}`;
    params.push(filters.endDate);
    paramIndex++;
  }
  if (filters.category) {
    sql += ` AND ve.category = $${paramIndex}`;
    params.push(filters.category);
    paramIndex++;
  }
  if (filters.direction) {
    sql += ` AND ve.direction = $${paramIndex}`;
    params.push(filters.direction);
    paramIndex++;
  }
  if (filters.gateName && filters.gateName !== 'all') {
    sql += ` AND LOWER(ve.gate_name) LIKE $${paramIndex}`;
    params.push(`%${filters.gateName.toLowerCase()}%`);
    paramIndex++;
  }
  if (filters.vehicleNumber) {
    sql += ` AND ve.vehicle_number ILIKE $${paramIndex}`;
    params.push(`%${filters.vehicleNumber}%`);
    paramIndex++;
  }

  sql += ` ORDER BY ve.event_time DESC, ve.id DESC`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Generate CSV report.
 * Columns: Vehicle Number, Vehicle Type, Owner Name, Area, Direction, Gate, Date & Time (IST)
 */
export async function generateCSVReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'vehicle_number', title: 'Vehicle Number' },
      { id: 'vehicle_type',   title: 'Vehicle Type'   },
      { id: 'owner_name',     title: 'Owner Name'     },
      { id: 'area',           title: 'Area'           },
      { id: 'direction',      title: 'Direction'      },
      { id: 'gate_name',      title: 'Gate'           },
      { id: 'date_time',      title: 'Date & Time (IST)' },
    ],
  });

  const records = data.map((row: any) => ({
    vehicle_number: row.vehicle_number,
    vehicle_type:   resolveVehicleTypeLabel(row.vehicle_type),
    owner_name:     row.owner_name || 'N/A',
    area:           row.category,
    direction:      row.direction,
    gate_name:      row.gate_name || 'Unknown',
    date_time:      toIST(new Date(row.event_time)),
  }));

  await csvWriter.writeRecords(records);
  return outputPath;
}

/**
 * Generate Excel report.
 * Columns: Vehicle Number, Vehicle Type, Owner Name, Area, Direction, Gate, Date & Time (IST)
 */
export async function generateExcelReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Vehicle Events');

  worksheet.columns = [
    { header: 'Vehicle Number',    key: 'vehicle_number', width: 20 },
    { header: 'Vehicle Type',      key: 'vehicle_type',   width: 15 },
    { header: 'Owner Name',        key: 'owner_name',     width: 25 },
    { header: 'Area',              key: 'area',           width: 10 },
    { header: 'Direction',         key: 'direction',      width: 12 },
    { header: 'Gate',              key: 'gate_name',      width: 20 },
    { header: 'Date & Time (IST)', key: 'date_time',      width: 28 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  data.forEach((row: any) => {
    worksheet.addRow({
      vehicle_number: row.vehicle_number,
      vehicle_type:   resolveVehicleTypeLabel(row.vehicle_type),
      owner_name:     row.owner_name || 'N/A',
      area:           row.category,
      direction:      row.direction,
      gate_name:      row.gate_name || 'Unknown',
      date_time:      toIST(new Date(row.event_time)),
    });
  });

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

/**
 * Generate PDF report.
 * Columns: Vehicle Number, Vehicle Type, Owner Name, Area, Direction, Gate, Date & Time (IST)
 */
export async function generatePDFReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    // ── Title ──────────────────────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold')
       .text('Vehicle Monitoring Report', { align: 'center' });
    doc.moveDown(0.4);

    // ── Applied filters ────────────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica');
    const filterParts: string[] = [];
    if (filters.startDate) filterParts.push(`From: ${toIST(filters.startDate)}`);
    if (filters.endDate)   filterParts.push(`To: ${toIST(filters.endDate)}`);
    if (filters.category)  filterParts.push(`Area: ${filters.category}`);
    if (filters.direction) filterParts.push(`Direction: ${filters.direction}`);
    if (filterParts.length) doc.text(filterParts.join('   |   '), { align: 'center' });
    doc.text(`Total Records: ${data.length}`, { align: 'center' });
    doc.moveDown(0.6);

    // ── Table layout ───────────────────────────────────────────────────────
    const pageWidth  = doc.page.width - 80; // 40px margin each side
    const colWidths  = {
      vehicle:   pageWidth * 0.16,
      type:      pageWidth * 0.13,
      owner:     pageWidth * 0.18,
      area:      pageWidth * 0.07,
      direction: pageWidth * 0.09,
      gate:      pageWidth * 0.16,
      time:      pageWidth * 0.21,
    };
    const ROW_H    = 18;
    const HEADER_H = 20;
    const LEFT     = 40;
    let y          = doc.y;

    /**
     * Draw one table row at vertical position `rowY`.
     * cols: array of [text, colWidth] pairs in order.
     */
    const drawRow = (cols: [string, number][], rowY: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = LEFT;
      cols.forEach(([text, w]) => {
        doc.text(String(text), x + 2, rowY + 3, { width: w - 4, lineBreak: false, ellipsis: true });
        x += w;
      });
    };

    const drawHeaderBg = (rowY: number) => {
      doc.rect(LEFT, rowY, pageWidth, HEADER_H).fill('#E0E0E0');
      doc.fillColor('black');
    };

    const drawRowBg = (rowY: number, even: boolean) => {
      if (even) {
        doc.rect(LEFT, rowY, pageWidth, ROW_H).fill('#F7F7F7');
        doc.fillColor('black');
      }
    };

    const drawGridLine = (rowY: number, height: number) => {
      doc.rect(LEFT, rowY, pageWidth, height).stroke('#CCCCCC');
    };

    // ── Header row ─────────────────────────────────────────────────────────
    drawHeaderBg(y);
    drawRow([
      ['Vehicle Number', colWidths.vehicle],
      ['Vehicle Type',   colWidths.type],
      ['Owner Name',     colWidths.owner],
      ['Area',           colWidths.area],
      ['Direction',      colWidths.direction],
      ['Gate',           colWidths.gate],
      ['Date & Time (IST)', colWidths.time],
    ], y, true);
    drawGridLine(y, HEADER_H);
    y += HEADER_H;

    // ── Data rows ──────────────────────────────────────────────────────────
    data.forEach((row: any, i: number) => {
      if (y + ROW_H > doc.page.height - 40) {
        doc.addPage();
        y = 40;
        // Repeat header on new page
        drawHeaderBg(y);
        drawRow([
          ['Vehicle Number', colWidths.vehicle],
          ['Vehicle Type',   colWidths.type],
          ['Owner Name',     colWidths.owner],
          ['Area',           colWidths.area],
          ['Direction',      colWidths.direction],
          ['Gate',           colWidths.gate],
          ['Date & Time (IST)', colWidths.time],
        ], y, true);
        drawGridLine(y, HEADER_H);
        y += HEADER_H;
      }

      drawRowBg(y, i % 2 === 0);
      drawRow([
        [row.vehicle_number || '—',                colWidths.vehicle],
        [resolveVehicleTypeLabel(row.vehicle_type), colWidths.type],
        [row.owner_name || '—',                    colWidths.owner],
        [row.category,                             colWidths.area],
        [row.direction,                            colWidths.direction],
        [row.gate_name || '—',                     colWidths.gate],
        [toIST(new Date(row.event_time)),           colWidths.time],
      ], y);
      drawGridLine(y, ROW_H);
      y += ROW_H;
    });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

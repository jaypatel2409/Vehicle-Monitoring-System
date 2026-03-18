import { query } from '../config/db';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { join } from 'path';
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
 * Fetch report data from database.
 * Includes camera_name and camera_index_code from vehicle_events.
 */
async function getReportData(filters: ReportFilters) {
  let sql = `
    SELECT
      ve.id,
      ve.vehicle_number,
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
 * Generate CSV report (includes camera_name column)
 */
export async function generateCSVReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'id',              title: 'ID' },
      { id: 'vehicle_number',  title: 'Vehicle Number' },
      { id: 'owner_name',      title: 'Owner Name' },
      { id: 'category',        title: 'Category' },
      { id: 'direction',       title: 'Direction' },
      { id: 'gate_name',       title: 'Gate Name' },
      { id: 'camera_name',     title: 'Camera Name' },
      { id: 'event_time',      title: 'Event Time' },
    ],
  });

  const records = data.map((row: any) => ({
    id:             row.id,
    vehicle_number: row.vehicle_number,
    owner_name:     row.owner_name || 'N/A',
    category:       row.category,
    direction:      row.direction,
    gate_name:      row.gate_name || 'Unknown',
    camera_name:    row.camera_name || 'N/A',
    event_time:     new Date(row.event_time).toISOString(),
  }));

  await csvWriter.writeRecords(records);
  return outputPath;
}

/**
 * Generate Excel report (includes camera_name column)
 */
export async function generateExcelReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Vehicle Events');

  // Add headers
  worksheet.columns = [
    { header: 'ID',             key: 'id',             width: 10 },
    { header: 'Vehicle Number', key: 'vehicle_number', width: 20 },
    { header: 'Owner Name',     key: 'owner_name',     width: 25 },
    { header: 'Category',       key: 'category',       width: 10 },
    { header: 'Direction',      key: 'direction',      width: 10 },
    { header: 'Gate Name',      key: 'gate_name',      width: 20 },
    { header: 'Camera Name',    key: 'camera_name',    width: 25 },
    { header: 'Event Time',     key: 'event_time',     width: 25 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add data rows
  data.forEach((row: any) => {
    worksheet.addRow({
      id:             row.id,
      vehicle_number: row.vehicle_number,
      owner_name:     row.owner_name || 'N/A',
      category:       row.category,
      direction:      row.direction,
      gate_name:      row.gate_name || 'Unknown',
      camera_name:    row.camera_name || 'N/A',
      event_time:     new Date(row.event_time),
    });
  });

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

/**
 * Generate PDF report (includes camera_name column)
 */
export async function generatePDFReport(
  filters: ReportFilters,
  outputPath: string
): Promise<string> {
  const data = await getReportData(filters);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('Vehicle Monitoring Report', { align: 'center' });
    doc.moveDown();

    // Filters info
    doc.fontSize(12);
    if (filters.startDate) {
      doc.text(`Start Date: ${filters.startDate.toLocaleDateString()}`);
    }
    if (filters.endDate) {
      doc.text(`End Date: ${filters.endDate.toLocaleDateString()}`);
    }
    if (filters.category) {
      doc.text(`Category: ${filters.category}`);
    }
    if (filters.direction) {
      doc.text(`Direction: ${filters.direction}`);
    }
    doc.text(`Total Records: ${data.length}`);
    doc.moveDown();

    // Table layout — camera_name takes a share from previously unused space
    const tableTop  = doc.y;
    const itemHeight = 20;
    const pageWidth  = doc.page.width - 100;
    const colWidths = {
      vehicle:  pageWidth * 0.20,
      owner:    pageWidth * 0.20,
      category: pageWidth * 0.08,
      direction: pageWidth * 0.08,
      gate:     pageWidth * 0.14,
      camera:   pageWidth * 0.16,
      time:     pageWidth * 0.14,
    };

    // Draw header
    doc.fontSize(10).font('Helvetica-Bold');
    let x = 50;
    doc.text('Vehicle',   x, tableTop, { width: colWidths.vehicle });   x += colWidths.vehicle;
    doc.text('Owner',     x, tableTop, { width: colWidths.owner });     x += colWidths.owner;
    doc.text('Category',  x, tableTop, { width: colWidths.category });  x += colWidths.category;
    doc.text('Direction', x, tableTop, { width: colWidths.direction }); x += colWidths.direction;
    doc.text('Gate',      x, tableTop, { width: colWidths.gate });      x += colWidths.gate;
    doc.text('Camera',    x, tableTop, { width: colWidths.camera });    x += colWidths.camera;
    doc.text('Time',      x, tableTop, { width: colWidths.time });

    // Draw data rows
    doc.font('Helvetica');
    let y = tableTop + itemHeight;
    data.forEach((row: any) => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = 50;
      }

      x = 50;
      doc.text(row.vehicle_number || 'N/A',                    x, y, { width: colWidths.vehicle });   x += colWidths.vehicle;
      doc.text(row.owner_name || 'N/A',                        x, y, { width: colWidths.owner });     x += colWidths.owner;
      doc.text(row.category,                                    x, y, { width: colWidths.category });  x += colWidths.category;
      doc.text(row.direction,                                   x, y, { width: colWidths.direction }); x += colWidths.direction;
      doc.text(row.gate_name || 'Unknown',                      x, y, { width: colWidths.gate });      x += colWidths.gate;
      doc.text(row.camera_name || 'N/A',                        x, y, { width: colWidths.camera });    x += colWidths.camera;
      doc.text(new Date(row.event_time).toLocaleString(),       x, y, { width: colWidths.time });

      y += itemHeight;
    });

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

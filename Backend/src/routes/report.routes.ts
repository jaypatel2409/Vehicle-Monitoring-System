import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  generateCSVReport,
  generateExcelReport,
  generatePDFReport,
  ReportFilters,
} from '../utils/report.util';
import { join } from 'path';
import { mkdir, unlink } from 'fs/promises';

const router = Router();

// Ensure reports directory exists
const reportsDir = join(process.cwd(), 'reports');
mkdir(reportsDir, { recursive: true }).catch(console.error);

/**
 * @route   POST /api/reports/export
 * @desc    Generate a report file and return a download URL
 * @access  Private (requires JWT)
 */
router.post('/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { format, startDate, endDate, category, direction, gateName, vehicleNumber } = req.body;

    if (!format || !['csv', 'excel', 'pdf'].includes(format)) {
      res.status(400).json({
        success: false,
        message: 'Invalid format. Must be csv, excel, or pdf',
      });
      return;
    }

    const filters: ReportFilters = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (category && (category === 'SEZ' || category === 'KC')) filters.category = category;
    if (direction && (direction === 'IN' || direction === 'OUT')) filters.direction = direction;
    if (gateName) filters.gateName = gateName;
    if (vehicleNumber) filters.vehicleNumber = vehicleNumber;

    const timestamp = Date.now();
    const ext = format === 'excel' ? 'xlsx' : format;
    const filename = `vehicle-report-${timestamp}.${ext}`;
    const outputPath = join(reportsDir, filename);

    switch (format) {
      case 'csv': await generateCSVReport(filters, outputPath); break;
      case 'excel': await generateExcelReport(filters, outputPath); break;
      case 'pdf': await generatePDFReport(filters, outputPath); break;
      default: throw new Error('Invalid format');
    }

    res.json({
      success: true,
      message: 'Report generated successfully',
      data: {
        filename,
        downloadUrl: `/api/reports/download/${filename}`,
      },
    });
  } catch (error: any) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message,
    });
  }
});

/**
 * @route   GET /api/reports/download/:filename
 * @desc    Download a previously generated report file.
 *          Intentionally PUBLIC — the file is opened via window.open() in the
 *          browser which cannot attach Authorization headers.
 *          Security is provided by the randomised timestamp in the filename.
 *          The file is deleted after download to keep the reports directory clean.
 * @access  Public
 */
router.get('/download/:filename', (req: Request, res: Response): void => {
  try {
    const { filename } = req.params;

    // Security: only allow safe filename characters — prevents directory traversal
    if (!filename.match(/^[a-zA-Z0-9._-]+$/)) {
      res.status(400).json({ success: false, message: 'Invalid filename' });
      return;
    }

    const filePath = join(reportsDir, filename);

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(404).json({ success: false, message: 'File not found' });
        }
      } else {
        // Clean up file after successful download
        unlink(filePath).catch(() => {/* ignore if already gone */ });
      }
    });
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, message: 'Failed to download file', error: error.message });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  generateCSVReport,
  generateExcelReport,
  generatePDFReport,
  ReportFilters,
} from '../utils/report.util';
import { join } from 'path';
import { mkdir } from 'fs/promises';

const router = Router();
router.use(authenticate);

// Ensure reports directory exists
const reportsDir = join(process.cwd(), 'reports');
mkdir(reportsDir, { recursive: true }).catch(console.error);

/**
 * @route   POST /api/reports/export
 * @desc    Export report in specified format
 * @access  Private
 */
router.post('/export', async (req: Request, res: Response): Promise<void> => {
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
    const filename = `vehicle-report-${timestamp}.${format === 'excel' ? 'xlsx' : format}`;
    const outputPath = join(reportsDir, filename);

    let filePath: string;
    switch (format) {
      case 'csv':
        filePath = await generateCSVReport(filters, outputPath);
        break;
      case 'excel':
        filePath = await generateExcelReport(filters, outputPath);
        break;
      case 'pdf':
        filePath = await generatePDFReport(filters, outputPath);
        break;
      default:
        throw new Error('Invalid format');
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
 * @desc    Download generated report
 * @access  Private
 */
router.get('/download/:filename', (req: Request, res: Response): void => {
  try {
    const { filename } = req.params;
    const filePath = join(reportsDir, filename);

    // Security: prevent directory traversal
    if (!filename.match(/^[a-zA-Z0-9._-]+$/)) {
      res.status(400).json({
        success: false,
        message: 'Invalid filename',
      });
      return;
    }

    res.download(filePath, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(404).json({
            success: false,
            message: 'File not found',
          });
        }
      }
    });
  } catch (error: any) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download file',
      error: error.message,
    });
  }
});

export default router;


import { Request, Response } from 'express';
import {
  getDashboardStats,
  getCurrentlyInsideVehicles,
  getVehicleEvents,
  getVehicleCountsByDateRange,
  getVehicleEventsForExport,
} from '../services/vehicle.service';

/**
 * Get dashboard statistics
 */
export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getDashboardStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message,
    });
  }
};

/**
 * Get currently inside vehicles
 */
export const getInsideVehicles = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const vehicles = await getCurrentlyInsideVehicles(limit);

    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error: any) {
    console.error('Get inside vehicles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inside vehicles',
      error: error.message,
    });
  }
};

/**
 * Get vehicle events (historical data)
 */
export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      category,
      direction,
      gateName,
      vehicleNumber,
      limit,
      offset,
    } = req.query;

    const filters: any = {
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    };

    if (startDate) {
      filters.startDate = new Date(startDate as string);
    }
    if (endDate) {
      filters.endDate = new Date(endDate as string);
    }
    if (category && (category === 'SEZ' || category === 'KC')) {
      filters.category = category;
    }
    if (direction && (direction === 'IN' || direction === 'OUT')) {
      filters.direction = direction;
    }
    if (gateName) {
      filters.gateName = gateName as string;
    }
    if (vehicleNumber) {
      filters.vehicleNumber = vehicleNumber as string;
    }

    const events = await getVehicleEvents(filters);

    res.json({
      success: true,
      data: events,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: events.length,
      },
    });
  } catch (error: any) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle events',
      error: error.message,
    });
  }
};

/**
 * Get vehicle counts for date range (for charts)
 */
export const getCountsByDateRange = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
      return;
    }

    const counts = await getVehicleCountsByDateRange(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({
      success: true,
      data: counts,
    });
  } catch (error: any) {
    console.error('Get counts by date range error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vehicle counts',
      error: error.message,
    });
  }
};


/**
 * Export vehicle events to CSV
 */
export const exportEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      category,
      direction,
      gateName,
      vehicleNumber,
    } = req.query;

    const filters: any = {};

    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (category) filters.category = category;
    if (direction) filters.direction = direction;
    if (gateName) filters.gateName = gateName as string;
    if (vehicleNumber) filters.vehicleNumber = vehicleNumber as string;

    const events = await getVehicleEventsForExport(filters);

    const { createObjectCsvStringifier } = require('csv-writer');
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'vehicleNumber', title: 'Vehicle Number'    },
        { id: 'vehicleType',   title: 'Vehicle Type'      },
        { id: 'ownerName',     title: 'Owner Name'        },
        { id: 'area',          title: 'Area'              },
        { id: 'direction',     title: 'Direction'         },
        { id: 'gateName',      title: 'Gate'              },
        { id: 'dateTime',      title: 'Date & Time (IST)' },
      ],
    });

    const header = csvStringifier.getHeaderString();
    const records = csvStringifier.stringifyRecords(events);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vehicle_events.csv"');

    res.send(header + records);
  } catch (error: any) {
    console.error('Export events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export vehicle events',
      error: error.message,
    });
  }
};

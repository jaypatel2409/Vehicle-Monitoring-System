import { Router } from 'express';
import {
  getStats,
  getInsideVehicles,
  getEvents,
  getCountsByDateRange,
  exportEvents,
} from '../controllers/vehicle.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All vehicle routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/vehicles/stats
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/stats', getStats);

/**
 * @route   GET /api/vehicles/inside
 * @desc    Get currently inside vehicles
 * @access  Private
 */
router.get('/inside', getInsideVehicles);

/**
 * @route   GET /api/vehicles/events
 * @desc    Get vehicle events (historical data)
 * @access  Private
 */
router.get('/events', getEvents);

/**
 * @route   GET /api/vehicles/export
 * @desc    Export vehicle events to CSV
 * @access  Private
 */
router.get('/export', exportEvents);

/**
 * @route   GET /api/vehicles/counts
 * @desc    Get vehicle counts by date range
 * @access  Private
 */
router.get('/counts', getCountsByDateRange);

export default router;


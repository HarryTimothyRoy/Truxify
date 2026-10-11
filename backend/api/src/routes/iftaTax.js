
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePolicy } from '../middleware/requirePolicy.js';
import { ValidationError } from '../utils/errors.js';
import { generateIftaReport } from '../services/iftaTax.js';

const router = express.Router();

/**
 * @openapi
 * /api/ifta-tax/generate-report:
 *   post:
 *     tags:
 *       - Compliance
 *     summary: Generate a quarterly IFTA tax report
 *     description: >
 *       Generates an IFTA report using the truck ID, GPS waypoints,
 *       and fuel purchase data, grouped by jurisdiction.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - truckId
 *               - waypoints
 *             properties:
 *               truckId:
 *                 type: string
 *                 description: Truck identifier.
 *                 example: TRK-1
 *               quarter:
 *                 type: string
 *                 description: Reporting quarter.
 *                 default: Q3
 *                 example: Q3
 *               year:
 *                 type: integer
 *                 description: Reporting year.
 *                 default: 2026
 *                 example: 2026
 *               waypoints:
 *                 type: array
 *                 description: Ordered GPS locations used to calculate mileage.
 *                 items:
 *                   type: object
 *                   required:
 *                     - latitude
 *                     - longitude
 *                   properties:
 *                     latitude:
 *                       type: number
 *                       minimum: -90
 *                       maximum: 90
 *                       example: 37.7749
 *                     longitude:
 *                       type: number
 *                       minimum: -180
 *                       maximum: 180
 *                       example: -122.4194
 *                     jurisdictionState:
 *                       type: string
 *                       description: State or jurisdiction associated with the waypoint.
 *                       example: CA
 *               fuelPurchases:
 *                 type: array
 *                 description: Optional fuel purchase records.
 *                 items:
 *                   type: object
 *                   properties:
 *                     jurisdictionState:
 *                       type: string
 *                       example: CA
 *                     gallons:
 *                       type: number
 *                       minimum: 0
 *                       example: 10
 *                     taxPaidUSD:
 *                       type: number
 *                       minimum: 0
 *                       example: 42
 *           example:
 *             truckId: TRK-1
 *             quarter: Q3
 *             year: 2026
 *             waypoints:
 *               - latitude: 37.7749
 *                 longitude: -122.4194
 *                 jurisdictionState: CA
 *               - latitude: 38.5816
 *                 longitude: -121.4944
 *                 jurisdictionState: CA
 *             fuelPurchases:
 *               - jurisdictionState: CA
 *                 gallons: 10
 *                 taxPaidUSD: 42
 *     responses:
 *       '200':
 *         description: IFTA report generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     truckId:
 *                       type: string
 *                       example: TRK-1
 *                     period:
 *                       type: string
 *                       example: Q3 2026
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalMilesDriven:
 *                           type: number
 *                         totalGallonsPurchased:
 *                           type: number
 *                         fleetAverageMpg:
 *                           type: number
 *                           nullable: true
 *                     jurisdictionBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           jurisdictionState:
 *                             type: string
 *                           totalMilesDriven:
 *                             type: number
 *                           taxableGallonsPurchased:
 *                             type: number
 *                           taxPaidUSD:
 *                             type: number
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       '400':
 *         description: Invalid request or GPS/fuel data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       '401':
 *         description: Authentication is missing or invalid.
 *       '403':
 *         description: The user does not have permission to generate IFTA reports.
 *       '500':
 *         description: An unexpected server error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.post(
  '/generate-report',
  authenticate,
  requirePolicy('ifta:generate-report'),
  (req, res) => {
    try {
      const { truckId, quarter, year, waypoints, fuelPurchases } = req.body || {};

      if (!truckId) {
        return res.status(400).json({ error: 'truckId parameter is required.' });
      }

      if (!Array.isArray(waypoints)) {
        return res.status(400).json({ error: 'Array of GPS waypoints is required.' });
      }

      // Previously unchecked: a non-array `fuelPurchases` reached `.forEach` and
      // turned a client mistake into a 500.
      if (fuelPurchases !== undefined && fuelPurchases !== null && !Array.isArray(fuelPurchases)) {
        return res.status(400).json({ error: 'fuelPurchases must be an array.' });
      }

      const report = generateIftaReport({
        truckId,
        quarter,
        year,
        waypoints,
        fuelPurchases
      });

      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      // Bad telemetry is a client error, not an outage, and reporting it as a
      // 500 hid invalid payloads from monitoring.
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to generate IFTA report.' });
    }
  }
);

export default router;

import { Router } from 'express';

import { requireAuth } from '../lib/authMiddleware.js';
import {
  normalizeCentersPayload,
  normalizeSearchDatesPayload,
  portalRequest,
} from '../lib/portalAvailabilityClient.js';

const router = Router();

// The consumer backend requires its own authenticated user session. The
// portal API key is server-side only and is never accepted from the caller.
router.use(requireAuth);

router.get('/occupations', async (req, res, next) => {
  try {
    res.json(await portalRequest('/api/external/portal-availability/v1/occupations'));
  } catch (error) {
    next(error);
  }
});

router.post('/search_dates', async (req, res, next) => {
  try {
    const payload = normalizeSearchDatesPayload(req.body);
    res.json(await portalRequest('/api/external/portal-availability/v1/search_dates', {
      method: 'POST',
      payload,
    }));
  } catch (error) {
    next(error);
  }
});

router.post('/centers', async (req, res, next) => {
  try {
    const payload = normalizeCentersPayload(req.body);
    res.json(await portalRequest('/api/external/portal-availability/v1/centers', {
      method: 'POST',
      payload,
    }));
  } catch (error) {
    next(error);
  }
});

export const portalAvailabilityRouter = router;

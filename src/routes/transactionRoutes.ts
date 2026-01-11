import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
    getDashboardSummary,
    getRecentActivity,
    addBuyEntry,
    addSellEntry,
    addShopBuy,
    addPalti,
    addWeightLoss,
    addFuel
} from '../controllers/transactionController';

const router = Router();

router.use(authenticate);

// Dashboard
router.get('/dashboard/summary', getDashboardSummary);
router.get('/recent', getRecentActivity);

// Entries
router.post('/buy', addBuyEntry);
router.post('/sell', addSellEntry);
router.post('/shop-buy', addShopBuy);
router.post('/palti', addPalti);
router.post('/weight-loss', addWeightLoss);
router.post('/fuel', addFuel);

export default router;

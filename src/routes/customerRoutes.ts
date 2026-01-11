import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getCustomers, addCustomer, getCustomerHistory } from '../controllers/customerController';

const router = Router();

router.use(authenticate);

router.get('/', getCustomers);
router.post('/', addCustomer);
router.get('/:id/history', getCustomerHistory);

export default router;

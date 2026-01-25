import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  getCustomers,
  addCustomer,
  getCustomerHistory,
  updateCustomer,
  addCustomerAdvance,
} from "../controllers/customerController";

const router = Router();

router.use(authenticate);

router.get("/", getCustomers);
router.post("/", addCustomer);
router.patch("/:id", updateCustomer);
router.post("/:id/advance", addCustomerAdvance);
router.get("/:id/history", getCustomerHistory);

export default router;

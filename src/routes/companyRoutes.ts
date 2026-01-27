import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  addCompany,
  deleteCompany,
  getCompanies,
  getCompanyHistory,
  updateCompany,
} from "../controllers/companyController";

const router = Router();

router.use(authenticate);

router.get("/", getCompanies);
router.post("/", addCompany);
router.get("/:id/history", getCompanyHistory);
router.patch("/:id", updateCompany);
router.delete("/:id", deleteCompany);

export default router;

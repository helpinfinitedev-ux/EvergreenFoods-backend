import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import {
  addCompany,
  deleteCompany,
  getCompanies,
  updateCompany,
} from "../controllers/companyController";

const router = Router();

router.use(authenticate);

router.get("/", getCompanies);
router.post("/", addCompany);
router.patch("/:id", updateCompany);
router.delete("/:id", deleteCompany);

export default router;

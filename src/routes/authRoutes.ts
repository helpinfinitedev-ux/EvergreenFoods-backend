import { Router } from "express";
import { login, register, getMe, verifyOtp } from "../controllers/authController";
import { authenticate } from "../middleware/authMiddleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.get("/me", authenticate, getMe);

export default router;

import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../app";
import { generateToken } from "../utils/jwt";
import { AuthRequest } from "../middleware/authMiddleware";
import { sendEmail } from "../utils/email";
import { buildOtpEmail } from "../utils/otpEmail";

const OTP_EXPIRES_MINUTES = 5;

function generateOtp(): string {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const register = async (req: Request, res: Response) => {
  try {
    const { name, mobile, password, role } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { mobile } });
    if (existingUser) {
      return res.status(400).json({ error: "Mobile already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        mobile,
        passwordHash,
        role: role || "DRIVER",
      },
    });

    const token = generateToken(user.id, user.role, user.status || "ACTIVE");
    res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { mobile, password } = req.body;

    const user = await prisma.user.findUnique({ where: { mobile } });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid password" });
    }
    if (user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Inactive User" });
    }

    // OTP step (admin only by default)
    if (user.role === "ADMIN") {
      const otp = generateOtp();
      const expiry = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          otp,
          otpExpiry: expiry,
        },
      });

      const to = process.env.OTP_MAIL;
      if (!to) {
        return res.status(500).json({ error: "OTP mail is not configured (OTP_MAIL)" });
      }

      const tpl = buildOtpEmail({ otp, expiresMinutes: OTP_EXPIRES_MINUTES });
      await sendEmail(to, tpl.subject, tpl.text, tpl.html);

      return res.json({
        requiresOtp: true,
        message: "OTP sent",
        user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role, status: user.status },
      });
    }

    const token = generateToken(user.id, user.role, user.status || "ACTIVE");
    res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role, status: user.status } });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error, message: "Login failed" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { mobile, otp } = req.body as { mobile: string; otp: string };
    if (!mobile || !otp) return res.status(400).json({ error: "mobile and otp are required" });

    const user = await prisma.user.findUnique({ where: { mobile } });
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.status !== "ACTIVE") return res.status(401).json({ error: "Inactive User" });

    if (!user.otp || !user.otpExpiry) return res.status(400).json({ error: "OTP not generated. Please login again." });
    if (new Date(user.otpExpiry).getTime() < Date.now()) return res.status(400).json({ error: "OTP expired. Please login again." });
    if (String(user.otp) !== String(otp)) return res.status(400).json({ error: "Invalid OTP" });

    // Clear OTP after success
    await prisma.user.update({
      where: { id: user.id },
      data: { otp: null, otpExpiry: null },
    });

    const token = generateToken(user.id, user.role, user.status || "ACTIVE");
    res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role, status: user.status } });
  } catch (error) {
    res.status(500).json({ error: "OTP verification failed" });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        mobile: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

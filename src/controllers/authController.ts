import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../app";
import { generateToken } from "../utils/jwt";
import { AuthRequest } from "../middleware/authMiddleware";

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
    const token = generateToken(user.id, user.role, user.status || "ACTIVE");

    res.json({ token, user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role, status: user.status } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
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

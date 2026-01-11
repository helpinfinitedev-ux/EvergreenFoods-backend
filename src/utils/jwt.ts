import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

export const generateToken = (userId: string, role: string, status: string) => {
  return jwt.sign({ userId, role, status }, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string; status: string };
  } catch (error) {
    return null;
  }
};

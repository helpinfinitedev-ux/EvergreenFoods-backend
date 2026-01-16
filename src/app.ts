import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const app = express();
export const prisma = new PrismaClient();

import authRoutes from "./routes/authRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import customerRoutes from "./routes/customerRoutes";
import adminRoutes from "./routes/adminRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import expenseRoutes from "./routes/expenseRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import companyRoutes from "./routes/companyRoutes";

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/api", transactionRoutes);
app.use("/api/customers", customerRoutes);
app.use("/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/admin/expenses", expenseRoutes);
app.use("/admin/payments", paymentRoutes);
app.use("/admin/companies", companyRoutes);

// Health Check
app.get("/", (req, res) => {
  res.json({ message: "Driver App Backend is Running 🚀" });
});

export default app;

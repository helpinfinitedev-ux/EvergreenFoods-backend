import express from "express";
import cors from "cors";
import { PrismaClient, Transaction } from "@prisma/client";
import authRoutes from "./routes/authRoutes";
import transactionRoutes from "./routes/transactionRoutes";
import customerRoutes from "./routes/customerRoutes";
import adminRoutes from "./routes/adminRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import expenseRoutes from "./routes/expenseRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import companyRoutes from "./routes/companyRoutes";
import { main } from "./seed";
import { updateDriverWalletWhenTransactionIsCreated, updateDriverWalletWhenTransactionIsDeleted } from "./workers/driver";

const app = express();
const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    transaction: {
      async create({ args, query }) {
        const result = await query(args);
        console.log("Transaction created:", result);

        // Update driver's updatedAt after transaction create
        await basePrisma.user.update({
          where: { id: result.driverId },
          data: { updatedAt: new Date() },
        });

        await updateDriverWalletWhenTransactionIsCreated(basePrisma as PrismaClient, result as Transaction);

        return result;
      },

      async update({ args, query }) {
        const result = await query(args);
        console.log("Transaction updated:", result.id);

        // Update driver's updatedAt after transaction update
        await basePrisma.user.update({
          where: { id: result.driverId },
          data: { updatedAt: new Date() },
        });

        return result;
      },

      async delete({ args, query }) {
        const result = await query(args);
        console.log("Transaction deleted:", result.id);
        await updateDriverWalletWhenTransactionIsDeleted(basePrisma as PrismaClient, result as Transaction);
        return result;
      },
    },
  },
});

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

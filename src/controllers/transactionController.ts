import { Request, Response } from "express";
import { prisma } from "../app";
import { AuthRequest } from "../middleware/authMiddleware";
import { getDriverStock, getDashboardStats } from "../services/stockService";
import { endOfDay, startOfDay } from "date-fns";
import { uploadImageFromUri } from "../utils/firebase";

// Dashboard Summary
export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const stats = await getDashboardStats(userId);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
};

// Recent Activity
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const transactions = await prisma.transaction.findMany({
      where: { driverId: userId },
      orderBy: { date: "desc" },
      take: 20,
    });
    res.json(transactions);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch activity" });
  }
};

// Add Buy Entry
export const addBuyEntry = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, rate, totalAmount, details, imageUrl, companyName } = req.body;

    const company = await prisma.company.findUnique({
      where: { name: companyName },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const companyId = company.id;

    const tx = await prisma.transaction.create({
      data: {
        driverId: userId,
        companyName,
        type: "BUY",
        amount: amount,
        unit: "KG",
        rate: rate,
        totalAmount: totalAmount,
        details,
        imageUrl,
        companyId,
      },
    });
    res.json(tx);
  } catch (e) {
    res.status(500).json({ error: "Failed to add entry" });
  }
};

// Add Sell Entry (With Stock Validation)
export const addSellEntry = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, customerId, rate, totalAmount, paymentCash, paymentUpi, details } = req.body;

    // 1. Check Stock
    const currentStock = await getDriverStock(userId);
    if (amount > currentStock) {
      // Allow a tiny margin for float errors? No, strict for now.
      return res.status(400).json({ error: `Insufficient stock. Available: ${currentStock}` });
    }

    // 2. Wrap in Transaction
    // We need to update Customer Balance + Create Transaction atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create Sell Transaction
      const transaction = await tx.transaction.create({
        data: {
          driverId: userId,
          type: "SELL",
          amount,
          unit: "KG",
          rate,
          totalAmount,
          paymentCash,
          paymentUpi,
          customerId,
          details,
        },
      });

      // Update Customer Balance
      // Balance = Old Balance + Bill Amount - (Cash + UPI)
      const bill = Number(totalAmount);
      const paid = Number(paymentCash || 0) + Number(paymentUpi || 0);
      const change = bill - paid;

      await tx.customer.update({
        where: { id: customerId },
        data: {
          balance: {
            increment: change,
          },
        },
      });

      // Update totalCapital with paymentCash
      const cashAmount = Number(paymentCash + paymentUpi || 0);
      if (cashAmount > 0 && process.env.TOTAL_CASH_ID) {
        // Fetch current totalCapital record
        const capitalRecord = await tx.totalCapital.findUnique({
          where: { id: process.env.TOTAL_CASH_ID },
        });

        if (capitalRecord) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          // Check if cashLastUpdatedAt is from a previous day
          let newTodayCash = cashAmount;
          if (capitalRecord.cashLastUpdatedAt) {
            const lastUpdated = new Date(capitalRecord.cashLastUpdatedAt);
            const lastUpdatedDay = new Date(lastUpdated.getFullYear(), lastUpdated.getMonth(), lastUpdated.getDate());

            // If last updated is today, add to existing todayCash
            if (lastUpdatedDay.getTime() === today.getTime()) {
              newTodayCash = Number(capitalRecord.todayCash) + cashAmount;
            }
            // If last updated is before today, todayCash resets to just the new cashAmount
          }

          await tx.totalCapital.update({
            where: { id: process.env.TOTAL_CASH_ID },
            data: {
              totalCash: {
                increment: cashAmount,
              },
              todayCash: newTodayCash,
              cashLastUpdatedAt: now,
            },
          });
        }
      }

      return transaction;
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to add sell entry" });
  }
};

// Add Shop Buy
export const addShopBuy = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, rate, totalAmount, details } = req.body;

    const tx = await prisma.transaction.create({
      data: {
        driverId: userId,
        type: "SHOP_BUY",
        amount,
        unit: "KG",
        rate,
        totalAmount,
        details,
      },
    });
    res.json(tx);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
};

// Add Palti
export const addPalti = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, transferDriverName, paltiAction } = req.body;

    const tx = await prisma.transaction.create({
      data: {
        driverId: userId,
        type: "PALTI",
        amount,
        unit: "KG",
        transferDriverName,
        paltiAction, // ADD or SUBTRACT
      },
    });
    res.json(tx);
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
};

// Add Weight Loss
export const addWeightLoss = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { amount, subType, details, imageUrl } = req.body;
    const date: Date = new Date();
    const start = startOfDay(date);
    const end = endOfDay(date);
    const transactions = await prisma.transaction.findMany({
      where: {
        driverId: userId,
      },
    });

    // const uploadedImageUrl = await uploadImageFromUri(imageUrl, "weight-loss");
    // console.log(imageUrl, uploadedImageUrl);
    const todayBuyKg = transactions.filter((t) => t.type === "BUY" || t.type === "SHOP_BUY" || (t.type === "PALTI" && t.paltiAction === "ADD")).reduce((sum, t) => sum + Number(t.amount), 0);
    const todaySellKg = transactions.filter((t) => t.type === "SELL" || (t.type === "PALTI" && t.paltiAction === "SUBTRACT")).reduce((sum, t) => sum + Number(t.amount), 0);

    const todayWeightLoss = transactions.filter((t) => t.type === "WEIGHT_LOSS").reduce((sum, t) => sum + Number(t.amount), 0);

    const todayStock = todayBuyKg - todaySellKg - todayWeightLoss;

    if (amount > todayStock+0.1) {
      console.log("Weight loss greater than today stock");
      res.status(400).json({ message: "Weight loss greater than today stock" });
      return;
    }

    const tx = await prisma.transaction.create({
      data: {
        driverId: userId,
        type: "WEIGHT_LOSS",
        subType, // MORTALITY or WASTE
        amount,
        unit: "KG",
        details,
        imageUrl,
      },
    });
    res.json(tx);
  } catch (e) {
    console;
    res.status(500).json({ error: "Failed" });
  }
};

// Add Fuel
export const addFuel = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const { amount, rate, totalAmount, vehicleId, currentKm, details, imageUrl, location, locationCoords } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          driverId: userId,
          type: "FUEL",
          amount,
          unit: "LITRE",
          rate,
          totalAmount,
          vehicleId,
          details,
          imageUrl,
          location,
          gpsLat: locationCoords?.lat,
          gpsLng: locationCoords?.lng,
        },
      });

      if (vehicleId && currentKm) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: {
            currentKm: Number(currentKm),
            imageUrl: imageUrl, // Save latest fuel slip image to vehicle
          },
        });
      }
      return transaction;
    });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed" });
  }
};

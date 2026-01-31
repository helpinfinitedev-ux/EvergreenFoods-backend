import { Request, Response } from "express";
import { prisma } from "../app";
import { AuthRequest } from "../middleware/authMiddleware";
import { getDriverStock, getDashboardStats } from "../services/stockService";
import { endOfDay, startOfDay } from "date-fns";
import { uploadImageFromUri } from "../utils/firebase";
import { updateTotalCashAndTodayCash } from "../services/cash.service";
import { TRANSACTION_TYPE } from "../utils/constants";
import { deleteSellTransaction } from "../services/transactions/index.service";
import { getEntityDetails, updateEntityBalance } from "../services/transactions/receivePayments.service";
import { Transaction } from "@prisma/client";
import { updateBankBalance } from "../services/bank.service";

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
      include: {
        company: true,
        customer: true,
      },
      orderBy: { date: "desc" },
      take: 50,
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

    const { amount, type, entityType, rate, totalAmount, details, imageUrl, companyName, companyId, driverId, customerId } = req.body;

    const createdTxn = await prisma.$transaction(async (tx) => {
      const entity = await getEntityDetails(tx, driverId || customerId || companyId || "", entityType);

      if (!entity) {
        throw new Error("ENTITY_NOT_FOUND");
      }

      const txn = await tx.transaction.create({
        data: {
          driverId: driverId || userId,
          companyName,
          type: "BUY",
          amount: amount,
          unit: "KG",
          rate: rate || 0,
          totalAmount: totalAmount,
          details,
          imageUrl,
          companyId,
          customerId,
        },
      });

      return txn;
    });

    res.json(createdTxn);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: "Failed to add entry" });
  }
};

// Add Sell Entry (With Stock Validation)
export const addSellEntry = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { amount, entityType, bankId, customerId, companyId, driverId, rate, totalAmount, paymentCash, paymentUpi, details } = req.body;

    // 1. Check Stock
    const currentStock = await getDriverStock(userId);
    if (amount > currentStock + 0.1) {
      // Allow a tiny margin for float errors? No, strict for now.
      return res.status(400).json({ error: `Insufficient stock. Available: ${currentStock}` });
    }

    // 2. Wrap in Transaction
    // We need to update Customer Balance + Create Transaction atomically
    const result = await prisma.$transaction(async (tx) => {
      // Create Sell Transaction
      const entity = await getEntityDetails(tx, customerId || companyId || driverId || userId, entityType);
      console.log(entity);
      const transaction = await tx.transaction.create({
        data: {
          driverId: driverId || userId,
          type: "SELL",
          amount: Number(amount || 0),
          unit: "KG",
          rate: Number(rate || 0),
          totalAmount: Number(totalAmount || 0),
          paymentCash,
          paymentUpi,
          bankId,
          customerId,
          companyId,
          details,
        },
      });

      // Update Customer Balance
      // Balance = Old Balance + Bill Amount - (Cash + UPI)
      const bill = Number(totalAmount);
      const paid = Number(paymentCash || 0) + Number(paymentUpi || 0);
      const change = bill - paid;

      await updateEntityBalance(tx, entity, change, entityType, entityType === "customer" ? "increment" : "decrement");
      await updateBankBalance(tx, bankId, Number(paymentUpi || 0), "increment");

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

    if (amount > todayStock + 0.1) {
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

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({ where: { id } });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (transaction.type === TRANSACTION_TYPE.SELL) {
      await deleteSellTransaction(transaction);
    }
    if (transaction.type === TRANSACTION_TYPE.BUY) {
    }
    await prisma.transaction.delete({ where: { id } });
    res.json(transaction);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message });
  }
};

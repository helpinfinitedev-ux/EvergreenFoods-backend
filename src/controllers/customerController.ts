import { Request, Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/authMiddleware';

export const getCustomers = async (req: Request, res: Response) => {
    try {
        const customers = await prisma.customer.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(customers);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
};

export const addCustomer = async (req: Request, res: Response) => {
    try {
        const { name, mobile, address, balance } = req.body;
        const customer = await prisma.customer.create({
            data: {
                name,
                mobile,
                address,
                balance: balance || 0
            }
        });
        res.json(customer);
    } catch (e) {
        res.status(400).json({ error: 'Failed to add customer' });
    }
};

export const updateCustomer = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, mobile, address, balance } = req.body;

        const data: { name?: string; mobile?: string; address?: string | null; balance?: number } = {};
        if (name !== undefined) data.name = name;
        if (mobile !== undefined) data.mobile = mobile;
        if (address !== undefined) data.address = address || null;
        if (balance !== undefined) data.balance = Number(balance);

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: "Nothing to update" });
        }

        const updated = await prisma.customer.update({
            where: { id },
            data,
        });
        res.json(updated);
    } catch (e) {
        res.status(400).json({ error: "Failed to update customer" });
    }
};

export const getCustomerHistory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Last 7 days? Or full history?
        // Let's give last 30 days for backend
        const now = new Date();
        const past = new Date(now.setDate(now.getDate() - 30));

        const history = await prisma.transaction.findMany({
            where: {
                customerId: id,
                date: { gte: past }
            },
            orderBy: { date: 'desc' }
        });
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
};

export const addCustomerAdvance = async (req: Request, res: Response) => {
    try {
        const userId = (req as AuthRequest).user?.userId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const { id } = req.params;
        const { amount, details } = req.body as { amount: number; details?: string };

        const numericAmount = Number(amount);
        if (Number.isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ error: 'amount must be a number > 0' });
        }

        const result = await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUnique({ where: { id } });
            if (!customer) {
                throw new Error('CUSTOMER_NOT_FOUND');
            }

            await tx.transaction.create({
                data: {
                    driverId: userId,
                    customerId: id,
                    type: 'ADVANCE_PAYMENT',
                    amount: numericAmount,
                    unit: 'INR',
                    totalAmount: numericAmount,
                    details: details?.trim() || 'Advance payment',
                },
            });

            const updatedCustomer = await tx.customer.update({
                where: { id },
                data: { balance: { increment: -numericAmount } },
            });

            const cashAmount = numericAmount;

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

            return updatedCustomer;
        });

        res.json({ success: true, customer: result });
    } catch (e: any) {
        if (e?.message === 'CUSTOMER_NOT_FOUND') {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.status(500).json({ error: 'Failed to add customer advance' });
    }
};

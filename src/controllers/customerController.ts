import { Request, Response } from 'express';
import { prisma } from '../app';

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

import { Request, Response } from "express";
import { prisma } from "../app";

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const params = req.query;
    const where: any = {};
    const pageSize = 10;
    const page = Math.max(1, Number(params.page as string) || 1);
    const skip = (page - 1) * pageSize;
    const queryObj: any = {};
    if (params.name) {
      where.name = { contains: params.name as string, mode: "insensitive" };
    }
    if (params.mobile) {
      where.mobile = { contains: params.mobile as string, mode: "insensitive" };
    }
    if (params.address) {
      where.address = {
        contains: params.address as string,
        mode: "insensitive",
      };
    }
    queryObj.where = where;
    queryObj.orderBy = { name: "asc" };
    if (params.page) {
      queryObj.take = pageSize;
      queryObj.skip = skip;
    }
    // queryObj.include = { company: true };
    const [total, companies] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany(queryObj),
    ]);
    // console.log(companies?.length);
    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      companies,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to get companies" });
  }
};

export const addCompany = async (req: Request, res: Response) => {
  try {
    const { name, address, mobile, amountDue } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }
    const company = await prisma.company.create({
      data: {
        name,
        address: address || null,
        mobile: mobile || null,
        amountDue: amountDue || 0,
      },
    });
    res.json(company);
  } catch (e) {
    res.status(400).json({ error: "Failed to add company" });
  }
};

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, mobile, amountDue } = req.body;
    const data: {
      name?: string;
      address?: string | null;
      mobile?: string | null;
      amountDue?: number;
    } = {};

    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address || null;
    if (mobile !== undefined) data.mobile = mobile || null;
    if (amountDue !== undefined) data.amountDue = amountDue;

    const company = await prisma.company.update({
      where: { id },
      data,
    });

    res.json(company);
  } catch (e) {
    res.status(400).json({ error: "Failed to update company" });
  }
};

export const deleteCompany = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.company.delete({ where: { id } });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: "Failed to delete company" });
  }
};

export const getCompanyHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Last 30 days of history
    const now = new Date();
    const past = new Date(now.setDate(now.getDate() - 30));

    const history = await prisma.transaction.findMany({
      where: {
        companyId: id,
        createdAt: { gte: past },
      },
      orderBy: { date: "desc" },
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: "Failed to get company history" });
  }
};

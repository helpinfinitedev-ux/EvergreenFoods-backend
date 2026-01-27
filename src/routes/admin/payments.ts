import { Request, Response } from "express";
import { prisma } from "../../app";

export const getPaymentsReceived = async (req:Request, res:Response)=>{
    const {id} = req.params;
    const {start,end,page, entityType} = req.query;

    const entityTypes = ["driver","customer","company"];
    if(entityType && !entityTypes.includes(entityType as string)){
        return res.status(400).json({error:"Invalid entity type"});
    }

    const where : Record<string,any> = {
     ...(entityType === "company" ? {companyId:id} : entityType === "customer" ? {customerId:id} : entityType === "driver" ? {driverId:id} : {}),
     type:"RECEIVE_PAYMENT"
    }
    console.log(where)
    if( start && end){
        const startDate = new Date(start as string);
        const endDate = new Date(end as string);
        where.date = {
            gte: startDate,
            lte: endDate
        }
    }
    const take = page ? 10 : undefined;
    const skip = page ? (Math.max(1, Number(page) || 1) - 1) * 10 : undefined;
    const queryObj : any = {where}
    if(take){
        queryObj.take = take;
    }
    if(skip){
        queryObj.skip = skip;
    }   
    queryObj.include = {driver:true,customer:true,company:true}
    queryObj.orderBy = {date:"desc"}
    console.log(queryObj)
    const [total,rows] = await Promise.all([
        prisma.transaction.count({where}),
        prisma.transaction.findMany(queryObj)
    ])
    console.log(total,rows)
    return res.json({total,rows});
}
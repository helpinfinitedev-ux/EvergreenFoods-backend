// Use a flexible type that works with both plain and extended Prisma clients
type PrismaTransactionClient = {
    totalCapital: {
        findUnique: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
    };
};

export const updateTotalCash = async (
    tx: PrismaTransactionClient,
    amount: number,
    operation: 'increment' | 'decrement',
) => {
    const totalCashId = process.env.TOTAL_CASH_ID;
    if (!totalCashId) {
        throw new Error('TOTAL_CASH_ID_NOT_SET');
    }

    const capital = await tx.totalCapital.findUnique({
        where: { id: totalCashId },
        select: {
            totalCash: true,
            todayCash: true,
            cashLastUpdatedAt: true,
        },
    });
    if (!capital) {
        throw new Error('TOTAL_CAPITAL_NOT_FOUND');
    
    }

    await tx.totalCapital.update({
        where: { id: totalCashId },
        data: {
            totalCash: { [operation]: amount },
        },
    });
    return capital;
};
export const updateTotalCashAndTodayCash = async (
    tx: PrismaTransactionClient,
    amount: number,
    operation: 'increment' | 'decrement',
) => {
    const numericAmount = Number(amount);
    if (numericAmount === 0) return;
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
        throw new Error('amount must be a number > 0');
    }
    const totalCashId = process.env.TOTAL_CASH_ID;
    if (!totalCashId) {
        throw new Error('TOTAL_CASH_ID_NOT_SET');
    }

    const capital = await tx.totalCapital.findUnique({
        where: { id: totalCashId },
    });
    if (!capital) {
        throw new Error('TOTAL_CAPITAL_NOT_FOUND');
    }

    if (
        operation === 'decrement' &&
        Number(capital.totalCash) - numericAmount < 0
    ) {
        throw new Error('TOTAL_CASH_INSUFFICIENT');
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let todayCashUpdate: any;
    if (capital.cashLastUpdatedAt) {
        const lastUpdated = new Date(capital.cashLastUpdatedAt);
        const lastUpdatedDay = new Date(
            lastUpdated.getFullYear(),
            lastUpdated.getMonth(),
            lastUpdated.getDate(),
        );
        if (lastUpdatedDay.getTime() === today.getTime()) {
            todayCashUpdate = { [operation]: numericAmount };
        } else {
            todayCashUpdate = numericAmount;
        }
    } else {
        todayCashUpdate = numericAmount;
    }

    if(operation === "decrement" && capital?.todayCash - numericAmount < 0){
        todayCashUpdate = {[operation]:capital?.todayCash}
    }

    await tx.totalCapital.update({
        where: { id: totalCashId },
        data: {
            totalCash: { [operation]: numericAmount },
            todayCash: todayCashUpdate,
            cashLastUpdatedAt: now,
        },
    });
};

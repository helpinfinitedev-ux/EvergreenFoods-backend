"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
exports.prisma = new client_1.PrismaClient();
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const transactionRoutes_1 = __importDefault(require("./routes/transactionRoutes"));
const customerRoutes_1 = __importDefault(require("./routes/customerRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const expenseRoutes_1 = __importDefault(require("./routes/expenseRoutes"));
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/auth", authRoutes_1.default);
app.use("/api", transactionRoutes_1.default);
app.use("/api/customers", customerRoutes_1.default);
app.use("/admin", adminRoutes_1.default);
app.use("/api/notifications", notificationRoutes_1.default);
app.use("/admin/expenses", expenseRoutes_1.default);
// Health Check
app.get("/", (req, res) => {
    res.json({ message: "Driver App Backend is Running 🚀" });
});
exports.default = app;

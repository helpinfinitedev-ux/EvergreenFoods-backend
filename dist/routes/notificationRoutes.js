"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.updateNotification = exports.createNotification = exports.getNotifications = void 0;
const express_1 = require("express");
const app_1 = require("../app");
const authMiddleware_1 = require("../middleware/authMiddleware");
// GET all notifications
const getNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { unreadOnly } = req.query;
        const where = {};
        if (unreadOnly === "true") {
            where.isRead = false;
        }
        const notifications = yield app_1.prisma.notification.findMany({
            where,
            orderBy: { date: "desc" },
        });
        res.json(notifications);
    }
    catch (error) {
        console.error("Get notifications error:", error);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});
exports.getNotifications = getNotifications;
// POST create a new notification
const createNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { message, date } = req.body;
        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }
        const notification = yield app_1.prisma.notification.create({
            data: {
                message,
                date: date ? new Date(date) : new Date(),
            },
        });
        res.status(201).json(notification);
    }
    catch (error) {
        console.error("Create notification error:", error);
        res.status(500).json({ error: "Failed to create notification" });
    }
});
exports.createNotification = createNotification;
// PATCH update notification (mark as read/unread)
const updateNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { isRead, message } = req.body;
        const existingNotification = yield app_1.prisma.notification.findUnique({
            where: { id },
        });
        if (!existingNotification) {
            return res.status(404).json({ error: "Notification not found" });
        }
        const updateData = {};
        if (typeof isRead === "boolean") {
            updateData.isRead = isRead;
        }
        if (message) {
            updateData.message = message;
        }
        const notification = yield app_1.prisma.notification.update({
            where: { id },
            data: updateData,
        });
        res.json(notification);
    }
    catch (error) {
        console.error("Update notification error:", error);
        res.status(500).json({ error: "Failed to update notification" });
    }
});
exports.updateNotification = updateNotification;
// PATCH mark all notifications as read
const markAllAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield app_1.prisma.notification.updateMany({
            where: { isRead: false },
            data: { isRead: true },
        });
        res.json({ success: true, message: "All notifications marked as read" });
    }
    catch (error) {
        console.error("Mark all as read error:", error);
        res.status(500).json({ error: "Failed to mark notifications as read" });
    }
});
exports.markAllAsRead = markAllAsRead;
// --- Routes ---
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
router.get("/", exports.getNotifications);
router.post("/", exports.createNotification);
router.patch("/read-all", exports.markAllAsRead);
router.patch("/:id", exports.updateNotification);
exports.default = router;

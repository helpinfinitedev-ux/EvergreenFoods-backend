import { Request, Response, Router } from "express";
import { prisma } from "../app";
import { authenticate } from "../middleware/authMiddleware";

// GET all notifications
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { unreadOnly } = req.query;

    const where: any = {};
    if (unreadOnly === "true") {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { date: "desc" },
    });

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// POST create a new notification
export const createNotification = async (req: Request, res: Response) => {
  try {
    const { message, date } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const notification = await prisma.notification.create({
      data: {
        message,
        date: date ? new Date(date) : new Date(),
      },
    });

    res.status(201).json(notification);
  } catch (error) {
    console.error("Create notification error:", error);
    res.status(500).json({ error: "Failed to create notification" });
  }
};

// PATCH update notification (mark as read/unread)
export const updateNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isRead, message } = req.body;

    const existingNotification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!existingNotification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const updateData: any = {};
    if (typeof isRead === "boolean") {
      updateData.isRead = isRead;
    }
    if (message) {
      updateData.message = message;
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: updateData,
    });

    res.json(notification);
  } catch (error) {
    console.error("Update notification error:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
};

// PATCH mark all notifications as read
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
};

// --- Routes ---
const router = Router();
router.use(authenticate);

router.get("/", getNotifications);
router.post("/", createNotification);
router.patch("/read-all", markAllAsRead);
router.patch("/:id", updateNotification);

export default router;



// Changed require → import
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// dotenv.config() stays same in ESM
dotenv.config();

// Create a reusable transporter (no changes needed here)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Changed exports.sendEmail → export const sendEmail
export const sendEmail = async (to: string, subject: string, text: string, html: string) => {
  await transporter.sendMail({
    from: `"EVERGREEN FOODS" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
  await transporter.sendMail({
    from: `"EVERGREEN FOODS" <${process.env.EMAIL_USER}>`,
    to: 'faisalmd25121999@gmail.com',
    subject,
    text,
    html,
  });
};

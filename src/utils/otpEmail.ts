export function buildOtpEmail(params: { otp: string; expiresMinutes: number }) {
  const { otp, expiresMinutes } = params;
  const subject = `Evergreen Foods OTP (${expiresMinutes} min)`;

  const text = `Your Evergreen Foods OTP is: ${otp}\n` + `This OTP expires in ${expiresMinutes} minutes.\n\n` + `If you did not attempt to log in, you can ignore this email.`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px 0;">Evergreen Foods - Login OTP</h2>
      <p style="margin: 0 0 12px 0;">Use this OTP to complete your login:</p>
      <div style="display:inline-block; padding:12px 16px; border-radius:10px; background:#f3f4f6; font-size:22px; font-weight:700; letter-spacing:2px;">
        ${otp}
      </div>
      <p style="margin: 12px 0 0 0; color:#6b7280;">Expires in ${expiresMinutes} minutes.</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin:16px 0;" />
      <p style="margin: 0; font-size:12px; color:#9ca3af;">If you did not attempt to log in, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL/TLS
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // Helps in development environments
    }
});

const sendWelcomeEmail = async (email, name) => {
    const mailOptions = {
        from: `"AI Parking System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Welcome to AI Parking System!',
        html: `<h1>Hello ${name},</h1><p>Your registration was successful. Welcome aboard!</p>`
    };
    return transporter.sendMail(mailOptions);
};

const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: `"AI Parking System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Verification Code',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2 style="color: #333;">Verification Code</h2>
                <p style="color: #666;">Use the following 4-digit code to verify your password reset request:</p>
                <h1 style="letter-spacing: 5px; color: #4f8ef7; background: #f4f4f4; padding: 10px; display: inline-block;">${otp}</h1>
                <p style="color: #999; font-size: 12px;">This code expires in 15 minutes.</p>
            </div>`
    };
    return transporter.sendMail(mailOptions);
};

const sendResetEmail = async (email, token) => {
    const resetUrl = `http://${process.env.SERVER_HOST || 'localhost'}:${process.env.PORT || 3000}/reset-password.html?token=${token}`;
    const mailOptions = {
        from: `"AI Parking System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #333;">Reset Your Password</h2>
                <p style="color: #666;">Verification successful. Click the button below to set a new password for your account.</p>
                <div style="margin: 30px 0;">
                    <a href="${resetUrl}" style="background-color: #4f8ef7; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #999; font-size: 12px;">This link will expire in 1 hour.</p>
            </div>`
    };
    return transporter.sendMail(mailOptions);
};

const sendPasswordResetSuccessEmail = async (email) => {
    const mailOptions = {
        from: `"AI Parking System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Password Reset Successful',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px;">
                <h2 style="color: #10b981;">Success!</h2>
                <p style="color: #666;">Your password has been successfully reset. You can now log in with your new password.</p>
            </div>`
    };
    return transporter.sendMail(mailOptions);
};

module.exports = { sendWelcomeEmail, sendOTPEmail, sendResetEmail, sendPasswordResetSuccessEmail };
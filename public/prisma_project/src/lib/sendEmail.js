import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
  const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!hasSmtpConfig) {
    console.log('\n=========================================');
    console.log(`✉️  EMAIL SIMULATION (SMTP Not Configured)`);
    console.log(`To:      ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message: \n${options.message}`);
    console.log('=========================================\n');
    return { success: true, simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: parseInt(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'PolyAttend'}" <${process.env.FROM_EMAIL || 'no-reply@polyattend.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html || `<p>${options.message}</p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️  Email sent successfully: ${info.messageId}`);
    return { success: true, info };
  } catch (error) {
    console.error('❌ Error sending email via SMTP:', error);
    console.log('\n=========================================');
    console.log(`✉️  EMAIL FALLBACK LOG (SMTP Failed)`);
    console.log(`To:      ${options.email}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message: \n${options.message}`);
    console.log('=========================================\n');
    return { success: false, error: error.message };
  }
};

export default sendEmail;

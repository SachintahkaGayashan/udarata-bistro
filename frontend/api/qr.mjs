// Vercel serverless function: GET /api/qr?d=SB1.<orderId>.<secret>  ->  PNG QR code
// Used only by the receipt email. Rejects anything that is not an unlock code,
// so it cannot be used as a general QR generator.
import QRCode from 'qrcode';

const CODE_RE = /^SB1\.[A-Za-z0-9_-]{10,40}\.[a-f0-9]{32}$/;

export default async function handler(req, res) {
  const d = typeof req.query.d === 'string' ? req.query.d : '';
  if (!CODE_RE.test(d)) {
    res.status(400).send('Bad request');
    return;
  }
  try {
    const png = await QRCode.toBuffer(d, {
      type: 'png',
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#3a1a0b', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.status(200).send(png);
  } catch (e) {
    res.status(500).send('Error');
  }
}
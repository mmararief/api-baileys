const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const QRCode = require('qrcode');
const fs = require('fs');
const fsPromises = require('fs/promises');
const cors = require('cors');
const { format } = require('date-fns');
const { createInvoice } = require('./createInvoice');
const socketIo = require('socket.io');
const app = express();
const server = createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(cors());

let sock;
let isAuthenticated = false;

const startSock = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({ auth: state });

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;
    if (qr) {
      const qrCodeDataURL = await QRCode.toDataURL(qr);
      io.emit('qr', qrCodeDataURL);
    }

    if (connection === 'open') {
      isAuthenticated = true;
      io.emit('authenticated', true);
    }

    if (connection === 'close') {
      isAuthenticated = false;
      const shouldReconnect = (update.lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        startSock();
      } else {
        io.emit('authenticated', false);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sock;
};

startSock();

app.get("/", (req, res) => res.send("Welcome to whatsapp gateway"));

app.get('/auth-status', async (req, res) => {
  res.status(200).json({ authenticated: isAuthenticated });
});

app.post('/logout', async (req, res) => {
  if (sock) {
    await sock.logout();
    await fs.rm('auth_info_baileys', { recursive: true, force: true });
    isAuthenticated = false;
    io.emit('authenticated', false);
    res.status(200).send('Logged out');
    startSock();
  } else {
    res.status(400).send('No active session');
  }
});


app.post('/send-message', async (req, res) => {
  let { phoneNumber, message } = req.body;
  if (!phoneNumber || !message) {
    return res.status(400).send('Phone number and message are required');
  }

  if (!phoneNumber.endsWith('@s.whatsapp.net')) {
    phoneNumber = `${phoneNumber}@s.whatsapp.net`;
  }

  try {
    await sock.sendMessage(phoneNumber, { text: message });
    res.status(200).send('Message sent');
  } catch (error) {
    res.status(500).send('Failed to send message');
  }
});

io.on('connection', (socket) => {
  console.log('Client connected');
});

app.post('/order-finish', (req, res) => {
  const orderDetails = req.body;
  console.log('Received webhook:', orderDetails);

  // Notify all connected clients
  io.emit('order-confirmed', orderDetails);

  res.status(200).send('Order confirmation notification sent to WebSocket clients.');
});

app.post('/order-confirmation', async (req, res) => {
  const data = req.body;
  console.log('Received webhook:', data);

  // Emit event to all connected clients
  io.emit('newTransaction', data);

  // Extract necessary details for WhatsApp message
  const { nama, whatsapp, metode_pembayaran, total, detailtransaksi } = data;

  // Construct product names string
  const productNames = detailtransaksi
    .map((detail) => detail.produk.nama_produk)
    .join(', ');

  const message = `Hai ${nama}, pesanan Anda untuk produk ${productNames} dengan total ${total} telah diterima. Silakan melakukan pembayaran ke ${metode_pembayaran} dan mengirim bukti pembayaran ke nomor ini. Terima kasih.`;

  try {
    await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
    res.status(200).send('Webhook received and message sent');
  } catch (err) {
    console.error('Failed to send message:', err);
    res.status(500).send('Webhook received but failed to send message');
  }
});

app.post('/send-invoice', async (req, res) => {
  const { id_transaksi, tanggal, via, nama, whatsapp, alamat, metode_pembayaran, status, total, details } = req.body;
  const invoiceData = { id_transaksi, tanggal, via, nama, whatsapp, alamat, metode_pembayaran, status, total, details };
  const message = `Hai ${nama}, pesanan Anda sudah di konfimasi. Kami akan segera memproses pesanan anda, Terima kasih...`;

  try {
    const filePath = `invoices/Invoice_${id_transaksi}_${nama}.pdf`;
    createInvoice(invoiceData, filePath, async () => {
      try {
        const fileBuffer = await fsPromises.readFile(filePath);
        await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, {
          document: fileBuffer,
          fileName: `Invoice_${id_transaksi}_${nama}.pdf`,
          mimetype: 'application/pdf'
        });

        await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
        await fsPromises.unlink(filePath);
        res.status(200).send('Invoice sent');
      } catch (error) {
        res.status(500).json({ error: 'Failed to send invoice', details: error.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  }
});

app.post('/webhook', (req, res) => {
    const data = req.body;
    console.log('Received webhook:', data);
  
    // Emit event ke semua client yang terhubung
    io.emit('newTransaction', data);
  
    res.status(200).send('Webhook received');
  });
  

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
io.on('connection', (socket) => {
    console.log('a user connected');
  
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
  });
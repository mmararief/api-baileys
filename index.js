const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const path = require('path');
const QRCode = require('qrcode');
const mysql = require('mysql2');
const fs = require('fs/promises');
const cors = require('cors');  // Import cors
const { format } = require('date-fns');


const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors());  // Use cors

let sock;


  
let isAuthenticated = false;



const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,

    });



    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('QR RECEIVED', qr);
            const qrCodeDataURL = await QRCode.toDataURL(qr);
            io.emit('qr', qrCodeDataURL);
        }

        if (connection === 'open') {
            console.log('WhatsApp connected');
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

// app.use(express.static(path.join(__dirname, 'public')));
app.get("/", (req, res) => res.send("Welcome to whatsapp gateway"));

// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

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
        console.error('Error sending message:', error);
        res.status(500).send('Failed to send message');
    }
});

io.on('connection', (socket) => {
    console.log('Client connected');
});







app.post('/order-confirmation', async (req, res) => {
    const {
      via,
      nama,
      nama_produk,
      whatsapp,
      alamat,
      metode_pembayaran,
      jumlah,
      status
    } = req.body;
  
 
  

  
    const message = `Hai ${nama}, pesanan Anda untuk produk ${nama_produk} dengan jumlah ${jumlah} telah berhasil dikonfirmasi. silahkan melakukan pembayaran ke ${metode_pembayaran} dan mengirim bukti pembayaran ke nomer ini, terima kasih.`;
  
      try {
        await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
        res.status(200).send('Order confirmed and message sent');
      } catch (err) {
        console.error('Error sending WhatsApp message:', err);
        res.status(500).send('Order confirmed but failed to send message');
      }
    });


const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
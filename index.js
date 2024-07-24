const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const path = require('path');
const QRCode = require('qrcode');
const mysql = require('mysql2');
const fs = require('fs').promises;
const fsPromises = require('fs/promises'); // Modul fs.promises untuk operasi asinkron
const cors = require('cors');  // Import cors
const { format } = require('date-fns');
const PDFDocument = require('pdfkit');

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
        total,
        status
    } = req.body;

    const message = `Hai ${nama}, pesanan Anda untuk produk ${nama_produk} dengan total ${total} telah diterima. Silakan melakukan pembayaran ke ${metode_pembayaran} dan mengirim bukti pembayaran ke nomor ini. Terima kasih.`;
  
      try {
        await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
        res.status(200).send('Order confirmed and message sent');
      } catch (err) {
        console.error('Error sending WhatsApp message:', err);
        res.status(500).send('Order confirmed but failed to send message');
      }
    });

app.post('/success-order', async (req, res) => {
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
        const message = `Hai ${nama}, pesanan Anda sudah di konfimasi. kami akan segera memproses pesanan anda, Terima kasih...`;
        console.log(message);
      
          try {
            await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
            res.status(200).send('Order confirmed and message sent');
          } catch (err) {
            console.error('Error sending WhatsApp message:', err);
            res.status(500).send('Order confirmed but failed to send message');
          }
        });


        const generateInvoicePDF = async (data) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const filePath = `./invoices/invoice_${data.id}_${data.nama}.pdf`;
        
            // Pastikan direktori ada
            await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        
            const writeStream = fs.createWriteStream(filePath);
            doc.pipe(writeStream);
        
            // Tambahkan logo di atas
            const logoPath = 'img/logo_kynan.png'; // Ganti dengan path logo Anda
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, { fit: [100, 100], align: 'center' })
                   .moveDown(1);
            }
        
            // Judul dan Header
            doc.moveDown(1)
               .fontSize(20)
               .text('Faktur', { align: 'center' })
               .moveDown(1);
        
            // Rincian Invoice
            doc.fontSize(12)
               .fillColor('black')
               .text(`ID Faktur: ${data.id}`, { align: 'center' })
               .moveDown(0.5)
               .text(`Tanggal: ${format(data.tanggal, 'dd-MM-yyyy HH:mm:ss')}`, { align: 'center' })
               .moveDown(0.5)
               .text(`Metode Pembayaran: ${data.metode_pembayaran}`, { align: 'center' })
               .moveDown(0.5)
               .text(`Status: ${data.status}`, { align: 'center' })
               .moveDown(1);
        
            // Rincian Pelanggan
            doc.fontSize(14)
               .fillColor('#333333')
               .text('Rincian Pelanggan:', { underline: true, align: 'left' })
               .moveDown(0.5)
               .fontSize(12)
               .fillColor('black')
               .text(`Nama: ${data.nama}`, { align: 'left' })
               .moveDown(0.5)
               .text(`WhatsApp: ${data.whatsapp}`, { align: 'left' })
               .moveDown(0.5)
               .text(`Alamat: ${data.alamat}`, { align: 'left' })
               .moveDown(1);
        
            // Rincian Produk
            doc.fontSize(14)
               .fillColor('#333333')
               .text('Rincian Produk:', { underline: true, align: 'left' })
               .moveDown(0.5)
               .fontSize(12)
               .fillColor('black');
        
            // Buat header tabel dengan warna latar belakang
            const tableTop = doc.y;
            const itemWidth = 200;
            const quantityWidth = 70;
            const priceWidth = 100;
            const subtotalWidth = 100;
        
            doc.rect(50, tableTop, itemWidth, 20).fill('#F2F2F2')
               .rect(50 + itemWidth, tableTop, quantityWidth, 20).fill('#F2F2F2')
               .rect(50 + itemWidth + quantityWidth, tableTop, priceWidth, 20).fill('#F2F2F2')
               .rect(50 + itemWidth + quantityWidth + priceWidth, tableTop, subtotalWidth, 20).fill('#F2F2F2');
        
            doc.fillColor('black')
               .text('Nama Produk', 55, tableTop + 5)
               .text('Jumlah', 55 + itemWidth, tableTop + 5, { width: quantityWidth, align: 'right' })
               .text('Harga Satuan', 55 + itemWidth + quantityWidth, tableTop + 5, { width: priceWidth, align: 'right' })
               .text('Subtotal', 55 + itemWidth + quantityWidth + priceWidth, tableTop + 5, { width: subtotalWidth, align: 'right' });
        
            // Tambahkan rincian produk ke tabel
            data.details.forEach((item, index) => {
                const yPosition = tableTop + 25 + (index * 20);
                doc.text(item.nama_produk, 55, yPosition, { width: itemWidth });
                doc.text(item.jumlah.toString(), 55 + itemWidth, yPosition, { width: quantityWidth, align: 'right' });
                doc.text(item.harga_satuan.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }), 55 + itemWidth + quantityWidth, yPosition, { width: priceWidth, align: 'right' });
                doc.text(item.subtotal.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }), 55 + itemWidth + quantityWidth + priceWidth, yPosition, { width: subtotalWidth, align: 'right' });
            });
        
            doc.moveDown(2);
        
            // Tambahkan Jumlah Total
            doc.fontSize(14)
               .fillColor('black')
               .text(`Jumlah Total: ${data.total.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })}`, { align: 'right' })
               .moveDown(1);
        
            // Footer
            doc.fontSize(10)
               .fillColor('gray')
               .text('Terima kasih atas pembelian Anda!', { align: 'center' })
               .text('Jika Anda memiliki pertanyaan, silakan hubungi kami di support@example.com.', { align: 'center' });
        
            doc.end();
        
            // Pastikan write stream telah selesai
            return new Promise((resolve, reject) => {
                writeStream.on('finish', () => resolve(filePath));
                writeStream.on('error', (err) => reject(err));
            });
        };
        
        
        app.post('/send-invoice', async (req, res) => {
            const {
                id,
                tanggal,
                via,
                nama,
                whatsapp,
                alamat,
                metode_pembayaran,
                status,
                total,
                details
            } = req.body;
        
            const invoiceData = {
                id,
                tanggal,
                via,
                nama,
                whatsapp,
                alamat,
                metode_pembayaran,
                status,
                total,
                details
            };
            console.log(invoiceData);
        
            const message = `Hai ${nama}, pesanan Anda sudah di konfimasi. kami akan segera memproses pesanan anda, Terima kasih...`;
        
            try {
                const filePath = await generateInvoicePDF(invoiceData);
        
                // Read the PDF file as a buffer
                const fileBuffer = await fsPromises.readFile(filePath);
        
                await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, {
                    document: fileBuffer,
                    fileName: `Invoice_${id}_${nama}.pdf`,
                    mimetype: 'application/pdf'
                });
        
                await sock.sendMessage(`${whatsapp}@s.whatsapp.net`, { text: message });
        
                res.status(200).send('Invoice sent');
            } catch (error) {
                console.error('Error sending invoice:', error);
                res.status(500).send('Failed to send invoice');
            }
        });
        

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
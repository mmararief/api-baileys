const fs = require('fs');
const fsPromises = fs.promises;
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

function createInvoice(invoiceData, path, callback) {
    let doc = new PDFDocument({ size: 'A4', margin: 50 });

    generateHeader(doc);
    generateCustomerInformation(doc, invoiceData);
    generateInvoiceTable(doc, invoiceData);
    generateFooter(doc);
    generateBarcode(doc, invoiceData.id_transaksi, () => {
        doc.pipe(fs.createWriteStream(path))
            .on('finish', function() {
                callback();
            });
        doc.end();
    });
}

function generateHeader(doc) {
    doc
        .image('img/logo_kynan.png', 50, 45, { width: 50 })
        .fillColor('#444444')
        .fontSize(20)
        .text('Dapur Kynan', 110, 57)
        .fontSize(10)
        .text('Dapur Kynan', 200, 50, { align: 'right' })
        .text('Jl. Pakis 8C No. 3 Blok BB11, RT.006/RW.012', 200, 65, { align: 'right' })
        .text('Pekayon Jaya, Kec. Bekasi Selatan, Kota Bekasi, Jawa Barat 17148', 200, 80, { align: 'right' })
        .moveDown();
}

function generateCustomerInformation(doc, invoice) {
    doc
        .fillColor('#444444')
        .fontSize(20)
        .text('Faktur', 50, 160);

    generateHr(doc, 185);

    const customerInformationTop = 200;

    doc
        .fontSize(10)
        .text('ID Faktur:', 50, customerInformationTop)
        .font('Helvetica-Bold')
        .text(invoice.id_transaksi, 150, customerInformationTop)
        .font('Helvetica')
        .text('Tanggal:', 50, customerInformationTop + 15)
        .text(formatDate(new Date(invoice.tanggal)), 150, customerInformationTop + 15)
        .text('Metode Pembayaran:', 50, customerInformationTop + 30)
        .text(invoice.metode_pembayaran, 150, customerInformationTop + 30)
        .text('Customer:', 50, customerInformationTop + 45)

        .text(invoice.nama, 150, customerInformationTop + 45)

        .text(invoice.alamat, 335, customerInformationTop )
        .text('WhatsApp: ' + invoice.whatsapp, 335, customerInformationTop + 15)
        .moveDown();

    generateHr(doc, 272);
}

function generateInvoiceTable(doc, invoice) {
    let i;
    const invoiceTableTop = 330;

    doc.font('Helvetica-Bold');
    generateTableRow(doc, invoiceTableTop, 'Nama Produk', 'Jumlah', 'Harga Satuan', 'Subtotal');
    generateHr(doc, invoiceTableTop + 20);
    doc.font('Helvetica');

    for (i = 0; i < invoice.details.length; i++) {
        const item = invoice.details[i];
        const position = invoiceTableTop + (i + 1) * 30;
        generateTableRow(
            doc,
            position,
            item.nama_produk,
            item.jumlah,
            formatCurrency(item.harga_satuan),
            formatCurrency(item.subtotal)
        );

        generateHr(doc, position + 20);
    }

    const totalPosition = invoiceTableTop + (i + 1) * 30;
    doc.font('Helvetica-Bold');
    generateTableRow(doc, totalPosition, '', '', 'Jumlah Total', formatCurrency(invoice.total));
    doc.font('Helvetica');
}

function generateFooter(doc) {
    doc
        .fontSize(10)
        .text('Terima kasih atas pembelian Anda. Jika Anda memiliki pertanyaan, silakan hubungi kami di 0812-3324-5579.', 50, 775, {
            align: 'center',
            width: 500
        });
}

function generateTableRow(doc, y, namaProduk, jumlah, hargaSatuan, subtotal) {
    doc.fontSize(10)
        .text(namaProduk, 50, y)
        .text(jumlah, 150, y)
        .text(hargaSatuan, 280, y, { width: 90, align: 'right' })
        .text(subtotal, 370, y, { width: 90, align: 'right' });
}

function generateHr(doc, y) {
    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
}

function formatCurrency(amount) {
    return 'Rp' + amount.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }).replace(/Rp/g, '').trim();
}

function formatDate(date) {
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}



function generateBarcode(doc, id_transaksi, callback) {
    const url = `http://localhost/kynan/pembayaran_sukses.php?id_transaksi=${id_transaksi}`;
    bwipjs.toBuffer({
        bcid: 'qrcode',
        text: url,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
    }, function (err, png) {
        if (err) {
            console.error(err);
            callback();
        } else {
            const barcodePath = 'barcode.png';
            fs.writeFile(barcodePath, png, function (err) {
                if (err) {
                    console.error(err);
                } else {
                    doc.image(barcodePath, 50, 650, { width: 100, height: 100 });
                }
                callback();
            });
        }
    });
}

function formatDate(date) {
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}


module.exports = {
    createInvoice
};

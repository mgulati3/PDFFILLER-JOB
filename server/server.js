// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
require('dotenv').config();

const app = express();
// Use port 5001 to avoid conflicts
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer setup for template uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, 'template.pdf'),
});
const upload = multer({ storage });

// Route: upload PDF template
app.post(
  '/api/upload-template',
  upload.single('pdfTemplate'),
  (req, res) => {
    console.log('🔔 Got upload request:', req.file);
    if (!req.file) {
      return res.status(400).send('No PDF template uploaded');
    }
    res.status(200).send('Template uploaded successfully');
  }
);

// Route: discover PDF form fields (if any)
app.get('/api/discover-fields', async (req, res) => {
  try {
    const templatePath = path.join(uploadsDir, 'template.pdf');
    if (!fs.existsSync(templatePath)) {
      return res
        .status(404)
        .send('PDF template not found. Please upload first.');
    }
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc   = await PDFDocument.load(pdfBytes);
    const form     = pdfDoc.getForm();
    const fields   = form.getFields().map(f => ({
      name: f.getName(),
      type: f.constructor.name
    }));
    res.json(fields);
  } catch (err) {
    console.error('Error discovering PDF fields:', err);
    res.status(500).send(`Error discovering fields: ${err.message}`);
  }
});

// Route: fill PDF by stamping text
app.post('/api/fill-pdf', async (req, res) => {
  try {
    const data = req.body; // { typeOfExpense, businessPurpose, … }

    // Load template
    const templatePath = path.join(uploadsDir, 'template.pdf');
    if (!fs.existsSync(templatePath)) {
      return res
        .status(404)
        .send('PDF template not found. Please upload first.');
    }
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc   = await PDFDocument.load(pdfBytes);

    // Embed font
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Work on first page
    const page = pdfDoc.getPage(0);

    // === 1) Stamp BLANK (1): typeOfExpense (Name of Supplier) ===
    // Rect [383.384, 670.907, 533.384, 684.742]
    page.drawText(data.typeOfExpense || '', {
      x:         383.384,
      y:         670.907,
      size:      12,
      font:      helveticaFont,
      maxWidth:  150,      // 533.384 - 383.384
      lineHeight: 14,
    });

    // === 2) Stamp BLANK (2): businessPurpose ===
    // Rect [ 48.0025, 477.82, 554.364, 530.333 ]
    page.drawText(data.businessPurpose || '', {
      x:          48.0025,
      y:          477.82,
      size:       12,
      font:       helveticaFont,
      maxWidth:   554.364 - 48.0025,  // ≈506.3615
      lineHeight: 14,
    });

    // TODO: repeat similar stamping for BLANKs 3–10 here...

    // Serialize and send PDF
    const filledPdfBytes = await pdfDoc.save();
    res.contentType('application/pdf');
    res.send(filledPdfBytes);
  } catch (err) {
    console.error('Error filling PDF:', err);
    res.status(500).send(`Error filling PDF: ${err.message}`);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

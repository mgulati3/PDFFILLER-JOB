// server.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Set up storage for PDF template uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, 'template.pdf');
  }
});

const upload = multer({ storage });

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Route to upload PDF template
app.post('/api/upload-template', upload.single('pdfTemplate'), (req, res) => {
  console.log('🔔 Got upload request:', req.file);
  if (!req.file) {
    return res.status(400).send('No PDF template uploaded');
  }
  res.status(200).send('Template uploaded successfully');
});


// New route to discover PDF form fields
app.get('/api/discover-fields', async (req, res) => {
  try {
    // Path to your PDF template
    const templatePath = path.join(__dirname, 'uploads', 'template.pdf');
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).send('PDF template not found. Please upload a template first.');
    }
    
    // Read the PDF template
    const pdfBytes = fs.readFileSync(templatePath);
    
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get the form
    const form = pdfDoc.getForm();
    
    // Get all form fields
    const fields = form.getFields();
    
    // Extract field information
    const fieldInfo = fields.map(field => {
      return {
        name: field.getName(),
        type: field.constructor.name,
      };
    });
    
    res.json(fieldInfo);
  } catch (error) {
    console.error('Error discovering PDF fields:', error);
    res.status(500).send(`Error discovering fields: ${error.message}`);
  }
});

// Route to fill the PDF with form data
app.post('/api/fill-pdf', async (req, res) => {
  try {
    const formData = req.body;
    const fieldMappings = req.body.fieldMappings || {};
    
    // Remove fieldMappings from formData to avoid treating it as a field
    if (formData.fieldMappings) {
      delete formData.fieldMappings;
    }
    
    // Path to your PDF template
    const templatePath = path.join(__dirname, 'uploads', 'template.pdf');
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).send('PDF template not found. Please upload a template first.');
    }
    
    // Read the PDF template
    const pdfBytes = fs.readFileSync(templatePath);
    
    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // Get the form fields
    const form = pdfDoc.getForm();
    
    // Fill form fields based on mappings if provided, otherwise use direct field names
    if (Object.keys(fieldMappings).length > 0) {
      // Using field mappings
      Object.keys(fieldMappings).forEach(formKey => {
        const pdfFieldName = fieldMappings[formKey];
        if (pdfFieldName && formData[formKey] !== undefined) {
          try {
            const field = form.getTextField(pdfFieldName);
            if (field) {
              field.setText(formData[formKey].toString());
            }
          } catch (err) {
            console.warn(`Field "${pdfFieldName}" not found or could not be filled: ${err.message}`);
          }
        }
      });
    } else {
      // Direct field mapping (form key = PDF field name)
      Object.keys(formData).forEach(fieldName => {
        try {
          const field = form.getTextField(fieldName);
          if (field) {
            field.setText(formData[fieldName].toString());
          }
        } catch (err) {
          console.warn(`Field "${fieldName}" not found or could not be filled: ${err.message}`);
        }
      });
    }
    
    // Flatten the form (makes the filled fields non-editable)
    form.flatten();
    
    // Save the filled PDF
    const filledPdfBytes = await pdfDoc.save();
    
    // Create a temporary file for the filled PDF
    const outputPath = path.join(__dirname, 'uploads', `filled_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, filledPdfBytes);
    
    // Send the filled PDF to the client
    res.contentType('application/pdf');
    res.send(filledPdfBytes);
    
    // Clean up the temporary file
    setTimeout(() => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }, 60000); // Delete after 1 minute
    
  } catch (error) {
    console.error('Error filling PDF:', error);
    res.status(500).send(`Error filling PDF: ${error.message}`);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
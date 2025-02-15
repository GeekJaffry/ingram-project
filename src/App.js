import React, { useState } from 'react';
import Papa from 'papaparse';

const App = () => {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [ocProductDescData, setOcProductDescData] = useState([]);
  const [result, setResult] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({
    ocProduct: false,
    ingramMicro: false,
    ocProductDesc: false
  });

  // Expected columns for each file
  const expectedColumns = {
    ocProduct: ['model', 'product_id', 'quantity'],
    ingramMicro: ['Product', 'Grade'],
    ocProductDesc: ['product_id', 'name']
  };

  // Helper function to handle file upload
  const handleFileUpload = (file, type) => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        // Validate columns
        const headers = Object.keys(results.data[0] || {});
        const missing = expectedColumns[type].filter(col => !headers.includes(col));
        
        if (missing.length > 0) {
          alert(`Error: Missing required columns in ${type}: ${missing.join(', ')}`);
          return;
        }

        // Update the corresponding state
        switch(type) {
          case 'ocProduct':
            setOcProductData(results.data);
            setUploadStatus(prev => ({ ...prev, ocProduct: true }));
            break;
          case 'ingramMicro':
            setIngramData(results.data);
            setUploadStatus(prev => ({ ...prev, ingramMicro: true }));
            break;
          case 'ocProductDesc':
            setOcProductDescData(results.data);
            setUploadStatus(prev => ({ ...prev, ocProductDesc: true }));
            break;
          default:
            break;
        }
      },
      error: (err) => {
        console.error(`Error loading CSV file: ${err}`);
        alert(`Error loading CSV file: ${err}`);
      }
    });
  };

  // Process data when all files are uploaded
  const processData = () => {
    if (!ocProductData.length || !ingramData.length || !ocProductDescData.length) {
      alert('Please upload all required files first');
      return;
    }

    const resultsArray = [];

    ocProductData.forEach((ocProduct) => {
      const { model, product_id, quantity } = ocProduct;

      // First get the OC product description to check storage
      const descMatch = ocProductDescData.find(item => item.product_id === product_id);
      if (!descMatch) return;
      const productDescName = descMatch.name;

      // Extract storage number from OC description parentheses (e.g., from "(512GB)" get "512")
      const ocStorageMatch = productDescName.match(/\((\d+)\s*(GB|TB)\)/i);
      const ocStorageNumber = ocStorageMatch ? ocStorageMatch[1] : null;
      const ocStorageUnit = ocStorageMatch ? ocStorageMatch[2].toUpperCase() : null;

      // Search ingram_micro for a matching model in the Product column
      const ingramMatch = ingramData.find(item => {
        if (!item.Product || !item.Product.includes(model)) return false;

        const ingramProduct = item.Product.toUpperCase();
        
        // If no storage info in OC, no need to check storage
        if (!ocStorageMatch) return true;

        // For TB, always require exact match (e.g., "1TB")
        if (ocStorageUnit === 'TB') {
          return ingramProduct.includes(`${ocStorageNumber}${ocStorageUnit}`);
        }
        
        // For GB, first check if Ingram has GB suffix
        const hasGB = /\d+\s*GB/i.test(ingramProduct);
        if (hasGB) {
          // If Ingram has GB, match the full "512GB"
          return ingramProduct.includes(`${ocStorageNumber}${ocStorageUnit}`);
        } else {
          // If Ingram doesn't have GB, match just the number "512"
          // But make sure we're matching the exact number, not part of another number
          const ingramNumbers = ingramProduct.match(/\d+/g) || [];
          return ingramNumbers.includes(ocStorageNumber);
        }
      });

      if (!ingramMatch) return;

      const ingramName = ingramMatch.Product;

      // Use storage from OC product description for display
      const storage = ocStorageMatch ? `${ocStorageNumber}${ocStorageUnit}` : 'No storage info';

      // Check for the special case of "Pristine A+ Open Box" in Grade column
      let grade = null;
      if (ingramMatch.Grade === 'Pristine A+ Open Box') {
        if (productDescName.includes('[Open Box]')) {
          grade = 'Open Box';
        }
      } else {
        const gradeMatch = ingramName.match(/Grade\s*([A-C])/i);
        grade = gradeMatch ? `Grade ${gradeMatch[1].toUpperCase()}` : null;
      }

      const storageMatches = !storage || productDescName.toLowerCase().includes(storage.toLowerCase());
      const gradeMatches = ingramMatch.Grade === 'Pristine A+ Open Box' ? 
        productDescName.includes('[Open Box]') : 
        (!grade || productDescName.toLowerCase().includes(grade.toLowerCase()));

      if (storageMatches && gradeMatches) {
        const displayStorage = storage || 'No storage info';
        const displayGrade = grade || 'No grade info';
        const displayString = `OC: ${productDescName} \nIngram: ${ingramMatch.Product} \nModel: ${model} | ${displayStorage} ${displayGrade} (Quantity ${quantity})`;
        resultsArray.push(displayString);
      }
    });

    setResult(resultsArray);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>CSV File Processor</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Required Files and Columns:</h3>
        <div style={{ marginBottom: '10px' }}>
          <p><strong>1. OC Product CSV</strong> (Required columns: {expectedColumns.ocProduct.join(', ')})</p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleFileUpload(e.target.files[0], 'ocProduct')}
          />
          {uploadStatus.ocProduct && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p><strong>2. Ingram Micro CSV</strong> (Required columns: {expectedColumns.ingramMicro.join(', ')})</p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleFileUpload(e.target.files[0], 'ingramMicro')}
          />
          {uploadStatus.ingramMicro && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p><strong>3. OC Product Description CSV</strong> (Required columns: {expectedColumns.ocProductDesc.join(', ')})</p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleFileUpload(e.target.files[0], 'ocProductDesc')}
          />
          {uploadStatus.ocProductDesc && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
        </div>
      </div>

      <button 
        onClick={processData}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
        disabled={!uploadStatus.ocProduct || !uploadStatus.ingramMicro || !uploadStatus.ocProductDesc}
      >
        Process Files
      </button>

      {result.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>Results:</h3>
          {result.map((item, index) => (
            <div key={index} style={{ 
              whiteSpace: 'pre-line',
              marginBottom: '10px',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px'
            }}>
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;

import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import StockMatcher from './StockMatcher.tsx';
import LogicComponent from './Logic';
import GptMatcher from './GptMatcher';

// Original matcher component
function OriginalMatcher() {
  const [ocProductData, setOcProductData] = useState([]);
  const [ingramData, setIngramData] = useState([]);
  const [result, setResult] = useState([]);
  const [ingramWithQuantities, setIngramWithQuantities] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({
    ocProduct: false,
    ingramMicro: false
  });

  // Expected columns for validation
  const expectedColumns = {
    ocProduct: ['Product Id', 'Model', 'Name', 'Qty', 'Price', 'Avg Cost', 'Status'],
    ingramMicro: ['Product', 'Grade', 'Vat Type', 'Spec.', 'Battery Health', 'Qty']
  };

  const handleFileUpload = (file, type) => {
    if (!file) return;

    if (type === 'ocProduct') {
      // Handle XLSX file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          setOcProductData(jsonData);
          setUploadStatus(prev => ({ ...prev, ocProduct: true }));
        } catch (error) {
          console.error('Error processing XLSX:', error);
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (type === 'ingramMicro') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const result = Papa.parse(text, { header: true });
          setIngramData(result.data);
          setUploadStatus(prev => ({ ...prev, ingramMicro: true }));
        } catch (error) {
          console.error('Error processing CSV:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  // Helper function to clean and normalize product names
  const normalizeProductName = (name) => {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .replace(/5G\s+/g, '') // Remove 5G with trailing space
      .replace(/\[[^\]]*\]/g, '') // Remove grade in square brackets
      .replace(/\((\d+)GB\)/g, '($1)') // Remove GB from parenthesis
      .replace(/[()]/g, ' ') // Remove parentheses
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
  };

  // Helper function to get name variations (for Plus/+ handling)
  const getNameVariations = (name) => {
    const variations = [name];
    
    // If name contains "Plus", add version with "+"
    if (name.includes(' Plus')) {
      variations.push(name.replace(' Plus', '+'));
    }
    // If name contains "+", add version with "Plus"
    else if (name.includes('+')) {
      variations.push(name.replace('+', ' Plus'));
    }
    
    return variations;
  };

  // Helper function to extract storage from product name
  const extractStorage = (text) => {
    if (!text || typeof text !== 'string') return null;
    
    const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:GB|TB)\b/i);
    return match ? match[0].toUpperCase() : null;
  };

  // Helper function to clean storage from product name
  const removeStorage = (name) => {
    return name
      .replace(/\(\d+\s*(?:GB|TB)\)/gi, '') // Remove storage in parentheses
      .replace(/\d+\s*(?:GB|TB)/gi, '') // Remove storage without parentheses
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing spaces
  };

  // Helper function to normalize model number
  const normalizeModel = (model) => {
    if (!model || typeof model !== 'string') return '';
    
    return model.toUpperCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/^SM/, '')
      .replace(/^SSM/, '')
      .replace(/\(.*?\)/g, '')
      .trim();
  };

  // Helper function to safely parse quantity
  const parseQuantity = (qty) => {
    if (qty === undefined || qty === null) return 0;
    if (typeof qty === 'number') return Math.max(0, qty);
    if (typeof qty === 'string') {
      const parsed = parseInt(qty, 10);
      return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    return 0;
  };

  // Helper function to extract grade from product name
  const extractGrade = (text) => {
    if (!text || typeof text !== 'string') return null;
    
    if (text.includes('[Brand New]')) return 'BN';
    if (text.includes('[Open Box]')) return 'OB';
    if (text.includes('[Like New]')) return 'LN';
    
    const gradeMatch = text.match(/\[Grade\s*([A-C])\]/i);
    if (gradeMatch) {
      const grade = gradeMatch[1].toUpperCase();
      if (grade === 'A') return 'GA';
      if (grade === 'B') return 'GB';
    }
    return null;
  };

  // Add new function for flexible model matching (from StockMatcher)
  const getFlexibleModelAndStorage = (product) => {
    const normalized = product.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/lte|4g/, '')
      .trim();

    // Storage extraction using existing extractStorage function
    const storage = extractStorage(normalized);

    // Model extraction
    let model = '';

    // A series with all variants
    const aMatch = normalized.match(/\sa(\d+[a-z]*)(?:\s|$)/);
    if (aMatch) {
      const baseModel = aMatch[1];
      const version = normalized.includes('v2') ? ' v2' : '';
      const is5G = normalized.includes('5g') ? ' 5g' : '';
      model = `galaxy a${baseModel}${version}${is5G}`;
    }
    // Z series with spacing fixes
    else if (normalized.match(/z\s*(?:flip|fold)/i)) {
      const typeMatch = normalized.match(/z\s*(flip|fold)\s*(\d+)/i);
      if (typeMatch) {
        const [_, type, num] = typeMatch;
        const is5G = normalized.includes('5g') ? ' 5g' : '';
        model = `galaxy z ${type} ${num}${is5G}`.toLowerCase();
      }
    }
    // Note series
    else if (normalized.match(/note\s*20/)) {
      model = normalized.includes('ultra') ? 'galaxy note 20 ultra' : 'galaxy note 20';
    }
    // S series with all variants
    else if (normalized.match(/(?:^|\s)s\d+/)) {
      const numMatch = normalized.match(/(?:^|\s)s(\d+)/);
      if (numMatch) {
        const baseNumber = numMatch[1];
        if (normalized.includes('ultra')) {
          model = `galaxy s${baseNumber} ultra`;
        } else if (normalized.includes('plus') || normalized.includes('+')) {
          model = `galaxy s${baseNumber} plus`;
        } else if (normalized.includes('fe')) {
          model = `galaxy s${baseNumber} fe`;
        } else {
          model = `galaxy s${baseNumber}`;
        }
      }
    }

    return { model, storage };
  };

  // Helper function to get base product name without grade
  const getBaseProductName = (name) => {
    if (!name || typeof name !== 'string') return '';
    return normalizeProductName(name).replace(/\s*\[[^\]]*\]\s*/g, '').trim();
  };

  const findFlexibleMatches = (ingramProduct, ocProductData) => {
    if (!ingramProduct || typeof ingramProduct !== 'string') return [];
    
    const { model, storage } = getFlexibleModelAndStorage(ingramProduct);
    if (!model || !storage) return [];

    return ocProductData
      .filter(row => {
        if (!row || !row.name || typeof row.name !== 'string') return false;
        const productName = row.name.toLowerCase().trim();
        
        // Skip accessories
        if (productName.includes('case') || 
            productName.includes('cover') || 
            productName.includes('screen protector') || 
            productName.includes('charger')) {
          return false;
        }

        const hasModel = productName.includes(model.toLowerCase());
        const hasStorage = storage ? productName.includes(storage.toLowerCase()) : true;
        
        return hasModel && hasStorage;
      })
      .map(row => ({
        product_id: row.product_id || '',
        name: row.name || '',
        quantity: parseQuantity(row.quantity)
      }));
  };

  // Process data when all files are uploaded
  const processData = () => {
    if (!ocProductData.length || !ingramData.length) {
      setResult(['Please upload all required files first.']);
      return;
    }

    const resultsArray = [];
    const modelMatches = new Map();
    const nameMatches = new Map();
    const ingramMatches = new Map();
    const matchedIngramIndices = new Set();
    const ingramWithQuantities = [];

    // First pass: Match by model number
    ocProductData.forEach(ocProduct => {
      if (!ocProduct.model || !ocProduct.name) return;

      const model = ocProduct.model;
      const storage = extractStorage(ocProduct.name);
      const key = storage ? `${model} (${storage})` : model;

      ingramData.forEach((ingramItem, ingramIndex) => {
        const ingramModel = normalizeModel(ingramItem.Product);
        const ingramStorage = extractStorage(ingramItem.Product);

        if (model && ingramModel.includes(model)) {
          if (!storage || !ingramStorage || storage === ingramStorage) {
            if (!modelMatches.has(key)) {
              modelMatches.set(key, new Set());
            }
            modelMatches.get(key).add(ingramIndex);
          }
        }
      });
    });

    // Process model matches
    modelMatches.forEach((matchingIndices, key) => {
      const matchingOcProducts = ocProductData.filter(p => {
        const pModel = normalizeModel(p.model);
        const pStorage = extractStorage(p.name);
        const pKey = pStorage ? `${pModel} (${pStorage})` : pModel;
        return pKey === key;
      });

      const gradeCounts = {
        BN: 0,
        GB: 0,
        GA: 0,
        OB: 0,
        LN: 0
      };

      matchingOcProducts.forEach(ocProduct => {
        const quantity = parseQuantity(ocProduct.quantity);
        const grade = extractGrade(ocProduct.name);
        if (grade) {
          gradeCounts[grade] += quantity;
        }
      });

      const displayString = `Name: ${key} | Match type: model, BN:${gradeCounts.BN},GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`;
      resultsArray.push(displayString);

      Array.from(matchingIndices).forEach(index => {
        matchedIngramIndices.add(index);
        if (!ingramMatches.has(index)) {
          ingramMatches.set(index, {
            type: 'model',
            matches: []
          });
        }
        
        const match = ingramMatches.get(index);
        match.matches.push({
          key,
          gradeCounts,
          quantity: Object.values(gradeCounts).reduce((a, b) => a + b, 0),
          matchingProducts: `Model: ${key} | BN:${gradeCounts.BN},GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`
        });
      });
    });

    // Second pass: Match by product name
    ocProductData.forEach(ocProduct => {
      const normalizedName = normalizeProductName(ocProduct.name);
      
      ingramData.forEach((ingramItem, ingramIndex) => {
        if (matchedIngramIndices.has(ingramIndex)) return;

        const ingramName = normalizeProductName(ingramItem.Product);
        if (normalizedName.includes(ingramName) || ingramName.includes(normalizedName)) {
          const key = ocProduct.name;
          if (!nameMatches.has(key)) {
            nameMatches.set(key, new Set());
          }
          nameMatches.get(key).add(ingramIndex);
        }
      });
    });

    // Process name matches
    nameMatches.forEach((matchingIndices, key) => {
      const matchingOcProducts = ocProductData.filter(p => 
        normalizeProductName(p.name) === normalizeProductName(key)
      );

      const gradeCounts = {
        BN: 0,
        GB: 0,
        GA: 0,
        OB: 0,
        LN: 0
      };

      matchingOcProducts.forEach(ocProduct => {
        const quantity = parseQuantity(ocProduct.quantity);
        const grade = extractGrade(ocProduct.name);
        if (grade) {
          gradeCounts[grade] += quantity;
        }
      });

      const displayString = `Name: ${key} | Match type: name, BN:${gradeCounts.BN},GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`;
      resultsArray.push(displayString);

      Array.from(matchingIndices).forEach(index => {
        matchedIngramIndices.add(index);
        if (!ingramMatches.has(index)) {
          ingramMatches.set(index, {
            type: 'name',
            matches: []
          });
        }
        
        const match = ingramMatches.get(index);
        match.matches.push({
          key,
          gradeCounts,
          quantity: Object.values(gradeCounts).reduce((a, b) => a + b, 0),
          matchingProducts: `Name: ${key} | BN:${gradeCounts.BN},GB:${gradeCounts.GB},GA:${gradeCounts.GA},OB:${gradeCounts.OB},LN:${gradeCounts.LN}`
        });
      });
    });

    // Third pass: Process unmatched Ingram items
    ingramData.forEach((ingramItem, ingramIndex) => {
      if (!matchedIngramIndices.has(ingramIndex)) {
        const displayString = `Name: ${ingramItem.Product} | Match type: not matched, BN:0,GB:0,GA:0,OB:0,LN:0`;
        resultsArray.push(displayString);
      }
    });

    // Create enhanced Ingram data with quantities
    ingramData.forEach((item, index) => {
      const match = ingramMatches.get(index);
      if (!match) {
        ingramWithQuantities.push({
          ...item,
          Quantity: 0,
          'Match Type': 'not matched',
          'Matching Products': '',
          'Grade Counts': 'BN:0,GB:0,GA:0,OB:0,LN:0'
        });
        return;
      }

      const totalQuantity = match.matches.reduce((sum, m) => sum + m.quantity, 0);
      const matchingProducts = match.matches.map(m => m.matchingProducts).join('\n');
      
      const combinedGradeCounts = match.matches.reduce((total, m) => {
        Object.entries(m.gradeCounts).forEach(([grade, count]) => {
          total[grade] = (total[grade] || 0) + count;
        });
        return total;
      }, { BN: 0, GB: 0, GA: 0, OB: 0, LN: 0 });

      ingramWithQuantities.push({
        ...item,
        Quantity: totalQuantity,
        'Match Type': match.type,
        'Matching Products': matchingProducts,
        'Grade Counts': `BN:${combinedGradeCounts.BN},GB:${combinedGradeCounts.GB},GA:${combinedGradeCounts.GA},OB:${combinedGradeCounts.OB},LN:${combinedGradeCounts.LN}`
      });
    });

    // Process matches
    const processMatches = (matchType, key, indices) => {
      console.log('\n=== Processing Match ===');
      console.log('Match Type:', matchType);
      console.log('Key:', key);
      console.log('Base Product:', getBaseProductName(key));

      const matchingProducts = [];
      const grades = { BN: 0, GB: 0, GA: 0, OB: 0, LN: 0 };
      const seenProducts = new Set();
      const baseProduct = getBaseProductName(key);

      indices.forEach(idx => {
        const ingramItem = ingramData[idx];
        console.log('\nProcessing Ingram Item:', ingramItem.Product);
        
        // Find all matching OC products
        const matches = ocProductData.filter(ocProduct => {
          const ocStorage = extractStorage(ocProduct.name);
          const ingramStorage = extractStorage(ingramItem.Product);
          const storageMatches = !ocStorage || !ingramStorage || ocStorage === ingramStorage;
          
          if (matchType === 'model') {
            return storageMatches && ocProduct.model === ingramItem.Product;
          } else {
            const ocBaseName = getBaseProductName(ocProduct.name);
            const ingramBaseName = getBaseProductName(ingramItem.Product);
            return storageMatches && (ocBaseName.includes(ingramBaseName) || ingramBaseName.includes(ocBaseName));
          }
        });

        console.log('Found Matches:', matches.length);
        
        matches.forEach(match => {
          console.log('\nMatching Product:', {
            name: match.name,
            quantity: parseQuantity(match.quantity),
            grade: extractGrade(match.name)
          });

          // Add to matching products list if not seen
          if (!seenProducts.has(match.name)) {
            console.log('New unique product found');
            seenProducts.add(match.name);
            matchingProducts.push(`Name: ${match.name}`);
            
            // Only count grades for unique products
            const grade = extractGrade(match.name);
            if (grade) {
              const quantity = parseQuantity(match.quantity);
              console.log('Setting grade quantity:', {
                grade,
                quantity,
                previousQuantity: grades[grade]
              });
              grades[grade] = quantity; // Set the quantity (not add)
            }
          } else {
            console.log('Product already processed, skipping');
          }
        });
      });

      if (matchingProducts.length > 0) {
        console.log('\nFinal Results:', {
          matchingProducts: matchingProducts.length,
          grades,
          totalQuantity: Object.values(grades).reduce((a, b) => a + b, 0)
        });

        const totalQuantity = Object.values(grades).reduce((a, b) => a + b, 0);
        const gradeString = `BN:${grades.BN},GB:${grades.GB},GA:${grades.GA},OB:${grades.OB},LN:${grades.LN}`;
        const result = matchingProducts.map(p => `${p} | ${gradeString}`).join('\n');
        
        ingramWithQuantities.push({
          key: matchType === 'name' ? baseProduct : key,
          quantity: totalQuantity,
          matchType,
          matches: result,
          gradeCounts: gradeString
        });
      }
    };

    // Process matches
    modelMatches.forEach((indices, key) => processMatches('model', key, indices));
    nameMatches.forEach((indices, key) => processMatches('name', key, indices));

    setResult(resultsArray);
    setIngramWithQuantities(ingramWithQuantities);
    console.log('Processing complete');
  };

  const downloadEnhancedIngram = () => {
    if (ingramWithQuantities.length === 0) {
      alert('No data to download. Please process files first.');
      return;
    }

    // Convert to CSV
    const csv = Papa.unparse(ingramWithQuantities);
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'ingram_with_quantities.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto p-4">
      <h1>File Processor</h1>
      <div style={{ marginBottom: '20px' }}>
        <h3>Required Files and Columns:</h3>
        <div style={{ marginBottom: '10px' }}>
          <p><strong>1. Phonebot Stock XLSX</strong> (Required columns: Name, Product Id, Model, Qty)</p>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => handleFileUpload(e.target.files[0], 'ocProduct')}
          />
          {uploadStatus.ocProduct && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
        </div>

        <div style={{ marginBottom: '10px' }}>
          <p><strong>2. Ingram Micro File</strong> (Required columns: Product)</p>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => handleFileUpload(e.target.files[0], 'ingramMicro')}
          />
          {uploadStatus.ingramMicro && <span style={{ color: 'green', marginLeft: '10px' }}>✓ Uploaded</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
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
          disabled={!uploadStatus.ocProduct || !uploadStatus.ingramMicro}
        >
          Process Files
        </button>

        <button 
          onClick={downloadEnhancedIngram}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
          disabled={ingramWithQuantities.length === 0}
        >
          Download Ingram CSV with Quantities
        </button>
      </div>

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
}

// Main App component
function App() {
  return (
    <Router>
      <div className="App">
        <nav style={{
          backgroundColor: '#1a202c',
          padding: '1rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'flex-start',
            gap: '2rem'
          }}>
            <Link 
              to="/" 
              style={{
                display: 'none',  
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                backgroundColor: window.location.pathname === '/' ? '#4a5568' : 'transparent',
                borderBottom: window.location.pathname === '/' ? '3px solid #60a5fa' : '3px solid transparent',
                fontSize: '1.125rem',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              All Data Match
            </Link>
            <Link 
              to="/inventory" 
              style={{
                display: 'none',  
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                backgroundColor: window.location.pathname === '/inventory' ? '#4a5568' : 'transparent',
                borderBottom: window.location.pathname === '/inventory' ? '3px solid #60a5fa' : '3px solid transparent',
                fontSize: '1.125rem',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              Claude Code
            </Link>
            <Link 
              to="/logic" 
              style={{
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                backgroundColor: window.location.pathname === '/logic' ? '#4a5568' : 'transparent',
                borderBottom: window.location.pathname === '/logic' ? '3px solid #60a5fa' : '3px solid transparent',
                fontSize: '1.125rem',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              Ingram
            </Link>
            <Link 
              to="/gpt-matcher" 
              style={{
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                backgroundColor: window.location.pathname === '/gpt-matcher' ? '#4a5568' : 'transparent',
                borderBottom: window.location.pathname === '/gpt-matcher' ? '3px solid #60a5fa' : '3px solid transparent',
                fontSize: '1.125rem',
                fontWeight: '500',
                transition: 'background-color 0.2s'
              }}
            >
              Likewise
            </Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Navigate to="/logic" />} />
          <Route path="/inventory" element={<StockMatcher />} />
          <Route path="/logic" element={<LogicComponent />} />
          <Route path="/gpt-matcher" element={<GptMatcher />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

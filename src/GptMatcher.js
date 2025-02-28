import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

function GptMatcher() {
  const [files, setFiles] = useState({
    products: null,
    likewise: null
  });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [downloadReady, setDownloadReady] = useState(false);

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.endsWith('.xlsx')) {
        setError('Please upload only Excel (.xlsx) files');
        return;
      }
      setFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!files.products || !files.likewise) {
      setError('Please upload both files before processing');
      return;
    }

    setProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('products', files.products);
    formData.append('likewise', files.likewise);

    try {
      const response = await axios.post('https://likewise-git-main-faizans-projects-6325c3cb.vercel.app/api/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setResult(response.data);
      setDownloadReady(true);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred during processing');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
      <h2>GPT-Powered Inventory Matcher</h2>
      
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3>Upload Files</h3>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFileChange(e, 'products')}
              style={{ marginBottom: '0.5rem' }}
            />
            <div style={{ fontSize: '0.875rem', color: '#666' }}>
              {files.products ? `Selected: ${files.products.name}` : 'Upload PRODUCTS.xlsx'}
            </div>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFileChange(e, 'likewise')}
              style={{ marginBottom: '0.5rem' }}
            />
            <div style={{ fontSize: '0.875rem', color: '#666' }}>
              {files.likewise ? `Selected: ${files.likewise.name}` : 'Upload LIKEWISE.xlsx'}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ 
            padding: '0.75rem', 
            backgroundColor: '#fee2e2', 
            color: '#dc2626',
            borderRadius: '0.375rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={processing || !files.products || !files.likewise}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: processing ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: processing ? 'not-allowed' : 'pointer',
            marginBottom: '1rem'
          }}
        >
          {processing ? 'Processing...' : 'Process Files'}
        </button>

        {downloadReady && (
          <button
            onClick={() => {
              window.location.href = 'https://likewise-git-main-faizans-projects-6325c3cb.vercel.app/api/download/processed_results.xlsx';
            }}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              display: 'block',
              marginTop: '1rem'
            }}
          >
            Download Matched Results
          </button>
        )}

        {result && (
          <div style={{ marginTop: '2rem' }}>
            <h3>Results:</h3>
            <pre style={{ 
              whiteSpace: 'pre-wrap',
              backgroundColor: '#f8fafc',
              padding: '1rem',
              borderRadius: '0.375rem',
              border: '1px solid #e2e8f0'
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default GptMatcher;
/**
 * Import Jobs Page
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import api from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
}

interface PreviewOffer {
  allegroOfferId: string;
  title: string;
  description?: string;
  price: number;
  quantity: number;
  status: string;
  publicationStatus?: string;
}

const ImportJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import preview states
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<PreviewOffer[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [importSource, setImportSource] = useState<'allegro' | 'sales-center' | null>(null);
  const [loadingImportAllegro, setLoadingImportAllegro] = useState(false);
  const [loadingImportSalesCenter, setLoadingImportSalesCenter] = useState(false);
  const [processingImport, setProcessingImport] = useState(false);

  // Export preview states
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<any[]>([]);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(new Set());
  const [exportType, setExportType] = useState<'products' | 'offers' | null>(null);
  const [loadingExportProducts, setLoadingExportProducts] = useState(false);
  const [loadingExportOffers, setLoadingExportOffers] = useState(false);
  const [processingExport, setProcessingExport] = useState(false);

  useEffect(() => {
    let intervalId: number | null = null;
    
    const loadJobsSafely = async () => {
      try {
        await loadJobs();
      } catch (err) {
        // If we get a 401, stop the interval to prevent infinite loops
        if (err instanceof AxiosError && err.response?.status === 401) {
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      }
    };
    
    loadJobsSafely();
    intervalId = window.setInterval(loadJobsSafely, 30000); // Refresh every 30 seconds
    
    return () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const loadJobs = async () => {
    try {
      const response = await api.get('/import/jobs');
      if (response.data.success) {
        setJobs(response.data.data.items || []);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to load import jobs', err);
      if (err instanceof AxiosError) {
        // Don't set error or try to handle 401 - the interceptor will handle redirect
        if (err.response?.status === 401) {
          return; // Let the interceptor handle the redirect
        }
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError('Failed to load import jobs. Please try again later.');
        }
      } else {
        setError('Failed to load import jobs. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewImport = async (source: 'allegro' | 'sales-center') => {
    if (source === 'allegro') {
      setLoadingImportAllegro(true);
    } else {
      setLoadingImportSalesCenter(true);
    }
    setError(null);
    setImportSource(source);

    try {
      const endpoint = source === 'allegro' 
        ? '/allegro/offers/import/preview'
        : '/allegro/offers/import/sales-center/preview';
      
      const response = await api.get(endpoint);
      if (response.data.success) {
        setImportPreviewData(response.data.data.items || []);
        setSelectedImportIds(new Set(response.data.data.items?.map((item: PreviewOffer) => item.allegroOfferId) || []));
        setShowImportPreview(true);
      }
    } catch (err) {
      console.error('Failed to preview import', err);
      if (err instanceof AxiosError) {
        // Don't set error if it's a 401 - the interceptor will handle redirect
        if (err.response?.status === 401) {
          return; // Let the interceptor handle the redirect
        }
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to preview import');
        }
      } else {
        setError('Failed to preview import');
      }
    } finally {
      if (source === 'allegro') {
        setLoadingImportAllegro(false);
      } else {
        setLoadingImportSalesCenter(false);
      }
    }
  };

  const handleApproveImport = async () => {
    if (selectedImportIds.size === 0) {
      setError('Please select at least one item to import');
      return;
    }

    setProcessingImport(true);
    setError(null);

    try {
      const endpoint = importSource === 'allegro'
        ? '/allegro/offers/import/approve'
        : '/allegro/offers/import/sales-center/approve';
      
      const response = await api.post(endpoint, {
        offerIds: Array.from(selectedImportIds),
      });

      if (response.data.success) {
        setSuccess(`Successfully imported ${response.data.data.totalImported || 0} offers`);
        setShowImportPreview(false);
        setImportPreviewData([]);
        setSelectedImportIds(new Set());
        loadJobs();
      }
    } catch (err) {
      console.error('Failed to import approved offers', err);
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error?.message || 'Failed to import approved offers');
      } else {
        setError('Failed to import approved offers');
      }
    } finally {
      setProcessingImport(false);
    }
  };

  const handlePreviewExport = async (type: 'products' | 'offers') => {
    if (type === 'products') {
      setLoadingExportProducts(true);
    } else {
      setLoadingExportOffers(true);
    }
    setError(null);
    setExportType(type);

    try {
      const endpoint = type === 'products' ? '/products' : '/allegro/offers';
      const response = await api.get(`${endpoint}?limit=1000`);
      
      if (response.data.success) {
        const items = response.data.data.items || [];
        setExportPreviewData(items);
        setSelectedExportIds(new Set(items.map((item: any) => item.id || item.allegroOfferId)));
        setShowExportPreview(true);
      }
    } catch (err) {
      console.error('Failed to preview export', err);
      if (err instanceof AxiosError) {
        // Don't set error if it's a 401 - the interceptor will handle redirect
        if (err.response?.status === 401) {
          return; // Let the interceptor handle the redirect
        }
        setError(err.response?.data?.error?.message || 'Failed to preview export');
      } else {
        setError('Failed to preview export');
      }
    } finally {
      if (type === 'products') {
        setLoadingExportProducts(false);
      } else {
        setLoadingExportOffers(false);
      }
    }
  };

  const handleApproveExport = async () => {
    if (selectedExportIds.size === 0) {
      setError('Please select at least one item to export');
      return;
    }

    setProcessingExport(true);
    setError(null);

    try {
      const endpoint = exportType === 'products'
        ? '/products/export/csv'
        : '/allegro/offers/export/csv';
      
      const response = await api.get(endpoint, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = exportType === 'products'
        ? `products_${new Date().toISOString().split('T')[0]}.csv`
        : `offers_${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setSuccess(`${exportType === 'products' ? 'Products' : 'Offers'} exported successfully`);
      setShowExportPreview(false);
      setExportPreviewData([]);
      setSelectedExportIds(new Set());
    } catch (err) {
      console.error('Failed to export', err);
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error?.message || 'Failed to export');
      } else {
        setError('Failed to export');
      }
    } finally {
      setProcessingExport(false);
    }
  };

  const toggleImportSelection = (id: string) => {
    const newSet = new Set(selectedImportIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedImportIds(newSet);
  };

  const toggleExportSelection = (id: string) => {
    const newSet = new Set(selectedExportIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedExportIds(newSet);
  };

  const selectAllImports = () => {
    setSelectedImportIds(new Set(importPreviewData.map(item => item.allegroOfferId)));
  };

  const deselectAllImports = () => {
    setSelectedImportIds(new Set());
  };

  const selectAllExports = () => {
    setSelectedExportIds(new Set(exportPreviewData.map((item: any) => item.id || item.allegroOfferId)));
  };

  const deselectAllExports = () => {
    setSelectedExportIds(new Set());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-100';
      case 'PROCESSING':
        return 'text-blue-600 bg-blue-100';
      case 'FAILED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return <div>Loading import jobs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Import & Export</h2>
        <div className="flex space-x-2">
          <div className="flex space-x-2 border-r pr-2 mr-2">
            <Button
              onClick={() => handlePreviewImport('allegro')}
              disabled={loadingImportAllegro || loadingImportSalesCenter || processingImport}
              variant="secondary"
              size="small"
            >
              {loadingImportAllegro ? 'Loading...' : '📥 Import from Allegro API'}
            </Button>
            <Button
              onClick={() => handlePreviewImport('sales-center')}
              disabled={loadingImportAllegro || loadingImportSalesCenter || processingImport}
              variant="secondary"
              size="small"
            >
              {loadingImportSalesCenter ? 'Loading...' : '📥 Import from Sales Center'}
            </Button>
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={() => handlePreviewExport('products')}
              disabled={loadingExportProducts || loadingExportOffers || processingExport}
              variant="secondary"
              size="small"
            >
              {loadingExportProducts ? 'Loading...' : '📤 Export Products'}
            </Button>
            <Button
              onClick={() => handlePreviewExport('offers')}
              disabled={loadingExportProducts || loadingExportOffers || processingExport}
              variant="secondary"
              size="small"
            >
              {loadingExportOffers ? 'Loading...' : '📤 Export Offers'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded whitespace-pre-line">
          <div className="font-semibold mb-2">Error:</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      <Card title="CSV Import Jobs">
        {jobs.length === 0 ? (
          <p className="text-gray-600">No import jobs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">File Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{job.fileName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {job.processedRows} / {job.totalRows} ({job.successfulRows} success, {job.failedRows} failed, {job.skippedRows} skipped)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.startedAt ? new Date(job.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.completedAt ? new Date(job.completedAt).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Import Preview Modal */}
      <Modal
        isOpen={showImportPreview}
        onClose={() => {
          setShowImportPreview(false);
          setImportPreviewData([]);
          setSelectedImportIds(new Set());
        }}
        title={`Review Import from ${importSource === 'allegro' ? 'Allegro API' : 'Sales Center'}`}
        size="xlarge"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Select items to import. {selectedImportIds.size} of {importPreviewData.length} selected.
            </p>
            <div className="flex space-x-2">
              <Button onClick={selectAllImports} variant="secondary" size="small">
                Select All
              </Button>
              <Button onClick={deselectAllImports} variant="secondary" size="small">
                Deselect All
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={selectedImportIds.size === importPreviewData.length && importPreviewData.length > 0}
                      onChange={(e) => e.target.checked ? selectAllImports() : deselectAllImports()}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {importPreviewData.map((offer) => (
                  <tr key={offer.allegroOfferId}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedImportIds.has(offer.allegroOfferId)}
                        onChange={() => toggleImportSelection(offer.allegroOfferId)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{offer.title}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{offer.price} PLN</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{offer.quantity}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{offer.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              onClick={() => {
                setShowImportPreview(false);
                setImportPreviewData([]);
                setSelectedImportIds(new Set());
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveImport}
              disabled={selectedImportIds.size === 0 || processingImport}
            >
              {processingImport ? 'Importing...' : `Import ${selectedImportIds.size} Selected`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Export Preview Modal */}
      <Modal
        isOpen={showExportPreview}
        onClose={() => {
          setShowExportPreview(false);
          setExportPreviewData([]);
          setSelectedExportIds(new Set());
        }}
        title={`Review Export - ${exportType === 'products' ? 'Products' : 'Offers'}`}
        size="xlarge"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Select items to export. {selectedExportIds.size} of {exportPreviewData.length} selected.
            </p>
            <div className="flex space-x-2">
              <Button onClick={selectAllExports} variant="secondary" size="small">
                Select All
              </Button>
              <Button onClick={deselectAllExports} variant="secondary" size="small">
                Deselect All
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={selectedExportIds.size === exportPreviewData.length && exportPreviewData.length > 0}
                      onChange={(e) => e.target.checked ? selectAllExports() : deselectAllExports()}
                      className="rounded"
                    />
                  </th>
                  {exportType === 'products' ? (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exportPreviewData.map((item: any) => {
                  const id = item.id || item.allegroOfferId;
                  return (
                    <tr key={id}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedExportIds.has(id)}
                          onChange={() => toggleExportSelection(id)}
                          className="rounded"
                        />
                      </td>
                      {exportType === 'products' ? (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.code}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.stockQuantity || 0}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.sellingPrice || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.title}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.price} {item.currency || 'PLN'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.stockQuantity || 0}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.status}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              onClick={() => {
                setShowExportPreview(false);
                setExportPreviewData([]);
                setSelectedExportIds(new Set());
              }}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveExport}
              disabled={selectedExportIds.size === 0 || processingExport}
            >
              {processingExport ? 'Exporting...' : `Export ${selectedExportIds.size} Selected`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ImportJobsPage;

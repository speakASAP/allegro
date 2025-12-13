/**
 * Import Jobs Page
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import api, { oauthApi } from '../services/api';
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
  currency?: string;
  quantity: number;
  status: string;
  publicationStatus?: string;
}

const ImportJobsPage: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requiresOAuth, setRequiresOAuth] = useState(false);

  // Import preview states
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<PreviewOffer[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [, setSelectedExportIds] = useState<Set<string>>(new Set());
  const [importSource, setImportSource] = useState<'allegro' | 'sales-center' | null>(null);
  const [loadingImportAllegro, setLoadingImportAllegro] = useState(false);
  const [loadingImportSalesCenter, setLoadingImportSalesCenter] = useState(false);
  const [processingImport, setProcessingImport] = useState(false);
  const [loadingImportAll, setLoadingImportAll] = useState(false);
  const [loadingImportAndFix, setLoadingImportAndFix] = useState(false);

  // Export preview states
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [exportPreviewData, setExportPreviewData] = useState<any[]>([]);
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
    setLoadingJobs(true);
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
      setLoadingJobs(false);
    }
  };

  const handleImportAllOffers = async () => {
    setLoadingImportAll(true);
    setError(null);
    setSuccess(null);
    setRequiresOAuth(false);

    try {
      const response = await api.get('/allegro/offers/import');
      if (response.data.success) {
        const totalImported = response.data.data?.totalImported || 0;
        setSuccess(`Successfully imported ${totalImported} offers from Allegro`);
        loadJobs(); // Refresh the jobs list
      }
    } catch (err) {
      console.error('Failed to import all offers', err);
      if (err instanceof AxiosError) {
        // Don't set error if it's a 401 - the interceptor will handle redirect
        if (err.response?.status === 401) {
          return; // Let the interceptor handle the redirect
        }
        const errorData = err.response?.data?.error;
        const errorMessage = errorData?.message || 'Failed to import offers';
        const needsOAuth = errorData?.requiresOAuth || errorMessage.toLowerCase().includes('oauth');
        
        if (needsOAuth) {
          setRequiresOAuth(true);
          setError(errorMessage);
        } else {
          const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
          if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
            setError(axiosError.serviceErrorMessage);
          } else {
            setError(errorMessage);
          }
        }
      } else {
        setError('Failed to import offers');
      }
    } finally {
      setLoadingImportAll(false);
    }
  };

  const handleImportAndFixTitles = async () => {
    setLoadingImportAndFix(true);
    setError(null);
    setSuccess(null);
    setRequiresOAuth(false);

    try {
      // Use longer timeout for bulk import and fix operation (120 seconds)
      const response = await api.post('/allegro/offers/import-and-fix-titles', {}, {
        timeout: 120000, // 120 seconds for import + fix + publish
      });
      if (response.data.success) {
        const data = response.data.data;
        const importCount = data.importResult?.totalImported || 0;
        const fixedCount = data.fixed || 0;
        const updatedCount = data.updated || 0;
        const publishResult = data.publishResult || {};
        const successful = publishResult.successful || 0;
        const failed = publishResult.failed || 0;
        
        let message = `Import completed: ${importCount} offers imported. `;
        if (fixedCount > 0) {
          message += `Fixed ${fixedCount} titles (removed trailing dots). `;
          message += `Updated ${updatedCount} in database. `;
          message += `Published to Allegro: ${successful} successful`;
          if (failed > 0) {
            message += `, ${failed} failed`;
          }
        } else {
          message += 'No offers with trailing dots found.';
        }
        
        setSuccess(message);
        loadJobs(); // Refresh the jobs list
      }
    } catch (err) {
      console.error('Failed to import and fix titles', err);
      if (err instanceof AxiosError) {
        // Don't set error if it's a 401 - the interceptor will handle redirect
        if (err.response?.status === 401) {
          return; // Let the interceptor handle the redirect
        }
        const errorData = err.response?.data?.error;
        const errorMessage = errorData?.message || 'Failed to import and fix titles';
        const needsOAuth = errorData?.requiresOAuth || errorMessage.toLowerCase().includes('oauth');
        
        if (needsOAuth) {
          setRequiresOAuth(true);
          setError(errorMessage);
        } else {
          const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
          if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
            setError(axiosError.serviceErrorMessage);
          } else {
            setError(errorMessage);
          }
        }
      } else {
        setError('Failed to import and fix titles');
      }
    } finally {
      setLoadingImportAndFix(false);
    }
  };

  const handleAuthorizeOAuth = async () => {
    try {
      const response = await oauthApi.authorize();
      if (response.data.success && response.data.data?.authorizationUrl) {
        // Redirect to Allegro authorization page
        window.location.href = response.data.data.authorizationUrl;
      } else {
        setError('Failed to generate authorization URL');
      }
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to start OAuth authorization');
        }
      } else {
        setError('Failed to start OAuth authorization');
      }
    }
  };

  const handlePreviewImport = async (source: 'allegro' | 'sales-center') => {
    if (source === 'allegro') {
      setLoadingImportAllegro(true);
    } else {
      setLoadingImportSalesCenter(true);
    }
    setError(null);
    setRequiresOAuth(false);
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
        const errorData = err.response?.data?.error;
        const errorMessage = errorData?.message || 'Failed to preview import';
        const needsOAuth = errorData?.requiresOAuth || errorMessage.toLowerCase().includes('oauth');
        
        if (needsOAuth) {
          setRequiresOAuth(true);
          setError(errorMessage);
        } else {
          const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
          if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
            setError(axiosError.serviceErrorMessage);
          } else {
            setError(errorMessage);
          }
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

  const handlePreviewExport = async () => {
    setLoadingExportOffers(true);
    setError(null);

    try {
      // Preview only first 10 offers
      const response = await api.get('/allegro/offers?limit=10&page=1');
      
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
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to preview export');
        }
      } else {
        setError('Failed to preview export');
      }
    } finally {
      setLoadingExportOffers(false);
    }
  };

  /**
   * Generate CSV from offers data
   */
  const generateCsvFromOffers = (offers: any[]): string => {
    const headers = [
      'Allegro Offer ID',
      'Title',
      'Price',
      'Currency',
      'Stock Quantity',
      'Status',
      'Publication Status',
      'Category ID',
      'Product Code',
      'Product Name',
      'Created At',
      'Last Synced At',
    ];

    const rows = offers.map((offer) => [
      offer.allegroOfferId || offer.id || '',
      offer.title || '',
      String(offer.price || 0),
      offer.currency || 'CZK',
      String(offer.stockQuantity || offer.quantity || 0),
      offer.status || '',
      offer.publicationStatus || '',
      offer.categoryId || '',
      offer.product?.code || '',
      offer.product?.name || '',
      offer.createdAt ? new Date(offer.createdAt).toISOString() : '',
      offer.lastSyncedAt ? new Date(offer.lastSyncedAt).toISOString() : '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csvContent;
  };

  const handleApproveExport = async () => {
    setProcessingExport(true);
    setError(null);

    try {
      // First, get total count
      const countResponse = await api.get('/allegro/offers?limit=1&page=1');
      if (!countResponse.data.success) {
        throw new Error('Failed to get offers count');
      }

      const total = countResponse.data.data.pagination?.total || 0;
      if (total === 0) {
        setError('No offers to export');
        setProcessingExport(false);
        return;
      }

      // Calculate batches: 100 offers per batch, max 10 parallel batches
      const batchSize = 100;
      const maxParallelBatches = 10;
      let batches: Array<{ page: number; limit: number }> = [];

      if (total <= 1000) {
        // If total <= 1000, use batches of 100
        const numBatches = Math.ceil(total / batchSize);
        batches = Array.from({ length: numBatches }, (_, i) => ({
          page: i + 1,
          limit: batchSize,
        }));
      } else {
        // If total > 1000, divide into 10 equal pieces
        const itemsPerBatch = Math.ceil(total / maxParallelBatches);
        batches = Array.from({ length: maxParallelBatches }, (_, i) => ({
          page: i + 1,
          limit: itemsPerBatch,
        }));
      }

      // Make parallel requests for all batches
      const batchPromises = batches.map((batch) =>
        api.get(`/allegro/offers?limit=${batch.limit}&page=${batch.page}`)
      );

      const batchResponses = await Promise.all(batchPromises);
      
      // Combine all offers
      const allOffers: any[] = [];
      for (const response of batchResponses) {
        if (response.data.success && response.data.data.items) {
          allOffers.push(...response.data.data.items);
        }
      }

      // Generate CSV client-side
      const csvContent = generateCsvFromOffers(allOffers);
      
      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `offers_${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setSuccess(`Successfully exported ${allOffers.length} offers`);
      setShowExportPreview(false);
      setExportPreviewData([]);
      setSelectedExportIds(new Set());
    } catch (err) {
      console.error('Failed to export', err);
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to export');
        }
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

  const selectAllImports = () => {
    setSelectedImportIds(new Set(importPreviewData.map(item => item.allegroOfferId)));
  };

  const deselectAllImports = () => {
    setSelectedImportIds(new Set());
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Import & Export</h2>
        </div>
        
        {/* Primary Import Actions */}
        <Card title="Import Offers from Allegro">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
              <Button
                onClick={handleImportAllOffers}
                disabled={loadingImportAll || loadingImportAndFix || loadingImportAllegro || loadingImportSalesCenter || processingImport}
                variant="primary"
                size="medium"
                className="flex-1"
              >
                {loadingImportAll ? '⏳ Importing...' : '📥 Import All Offers from Allegro'}
              </Button>
              <Button
                onClick={handleImportAndFixTitles}
                disabled={loadingImportAll || loadingImportAndFix || loadingImportAllegro || loadingImportSalesCenter || processingImport}
                variant="secondary"
                size="medium"
                className="flex-1"
              >
                {loadingImportAndFix ? '⏳ Importing & Fixing...' : '🔧 Import & Fix Titles'}
              </Button>
              <Button
                onClick={() => handlePreviewImport('allegro')}
                disabled={loadingImportAll || loadingImportAndFix || loadingImportAllegro || loadingImportSalesCenter || processingImport}
                variant="secondary"
                size="medium"
                className="flex-1"
              >
                {loadingImportAllegro ? '⏳ Loading...' : '📋 Preview & Select from Allegro API'}
              </Button>
            </div>
            <p className="text-sm text-gray-600">
              <strong>Import All Offers:</strong> Imports all existing offers from your Allegro account directly into the database.
              <br />
              <br />
              <strong>Import & Fix Titles:</strong> Imports all offers, removes trailing dots from titles, and updates them back to Allegro.
              <br />
              <strong>Preview & Select:</strong> Preview offers from Allegro API and select which ones to import.
            </p>
          </div>
        </Card>

        {/* Secondary Actions */}
        <div className="flex justify-end space-x-2">
          <Button
            onClick={() => handlePreviewImport('sales-center')}
            disabled={loadingImportAll || loadingImportAndFix || loadingImportAllegro || loadingImportSalesCenter || processingImport}
            variant="secondary"
            size="small"
          >
            {loadingImportSalesCenter ? 'Loading...' : '📋 Preview from Sales Center'}
          </Button>
          <Button
            onClick={handlePreviewExport}
            disabled={loadingExportOffers || processingExport}
            variant="secondary"
            size="small"
          >
            {loadingExportOffers ? 'Loading...' : '📤 Export Offers'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded whitespace-pre-line">
          <div className="font-semibold mb-2">Error:</div>
          <div className="text-sm mb-3">{error}</div>
          {requiresOAuth && (
            <div className="mt-3 pt-3 border-t border-red-300">
              <p className="text-sm mb-3">To import offers from Allegro, you need to authorize the application via OAuth.</p>
              <div className="flex space-x-2">
                <Button
                  onClick={handleAuthorizeOAuth}
                  variant="primary"
                  size="small"
                >
                  Authorize with Allegro
                </Button>
                <Button
                  onClick={() => navigate('/dashboard/settings')}
                  variant="secondary"
                  size="small"
                >
                  Go to Settings
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      <Card title="CSV Import Jobs">
        {loadingJobs ? (
          <p className="text-gray-600">Loading import jobs...</p>
        ) : jobs.length === 0 ? (
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
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {offer.price} {offer.currency || 'CZK'}
                    </td>
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
        title="Export Offers - Preview"
        size="xlarge"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Preview of first 10 offers. All offers will be exported to CSV.
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exportPreviewData.map((item: any) => {
                  const id = item.id || item.allegroOfferId;
                  return (
                    <tr key={id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.title}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.price} {item.currency || 'CZK'}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.stockQuantity || 0}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{item.status}</td>
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
              disabled={processingExport}
            >
              {processingExport ? 'Exporting...' : 'Export All Offers'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ImportJobsPage;

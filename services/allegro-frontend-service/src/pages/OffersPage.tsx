/**
 * Offers Page - View all imported/exported Allegro offers
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AxiosError } from 'axios';
import api from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';

interface ImageItem {
  url?: string;
  path?: string;
}

type ImageArray = (string | ImageItem)[];

interface ParameterValue {
  name?: string;
}

interface Parameter {
  id?: string;
  name?: string;
  values?: ParameterValue[] | string;
  value?: string;
}

interface AttributeInput {
  id?: string;
  values?: string[];
  property?: {
    id?: string;
    values?: string[];
  };
}

interface Price {
  amount: string;
  currency: string;
}

interface MinimalPrice {
  amount: string;
  currency: string;
}

interface SellingMode {
  format?: string;
  price?: {
    amount: string;
    currency: string;
    minimalPrice?: MinimalPrice;
  };
}

interface AfterSalesServices {
  impatient?: string;
  returnPolicy?: string;
  warranty?: string;
}

interface Variant {
  name?: string;
  quantity?: number;
  price?: Price;
}

interface Publication {
  startedAt?: string;
  endedAt?: string;
  endingAt?: string;
}

interface AllegroRawData {
  parameters?: Parameter[];
  sellingMode?: SellingMode;
  afterSalesServices?: AfterSalesServices;
  variants?: Variant[];
  publication?: Publication;
  delivery?: Record<string, unknown>;
  deliveryOptions?: Record<string, unknown>;
  payments?: Record<string, unknown>;
  paymentOptions?: Record<string, unknown>;
  images?: ImageArray;
  [key: string]: unknown;
}

interface AllegroProductParameter {
  parameterId: string;
  name?: string;
  values?: unknown;
  valuesIds?: unknown;
  rangeValue?: unknown;
}

interface AllegroProduct {
  id: string;
  allegroProductId: string;
  name?: string;
  brand?: string;
  manufacturerCode?: string;
  ean?: string;
  publicationStatus?: string;
  isAiCoCreated?: boolean;
  marketedBeforeGPSR?: boolean | null;
  rawData?: unknown;
  parameters?: AllegroProductParameter[];
}

interface Offer {
  id: string;
  allegroOfferId: string;
  title: string;
  description?: string;
  categoryId: string;
  price: number;
  currency: string;
  stockQuantity: number;
  status: string;
  publicationStatus?: string;
  lastSyncedAt?: string;
  syncSource?: string;
  syncStatus?: string;
  syncError?: string;
  validationStatus?: 'READY' | 'WARNINGS' | 'ERRORS';
  validationErrors?: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
  lastValidatedAt?: string;
  images?: ImageArray;
  rawData?: AllegroRawData;
  product?: {
    id: string;
    code: string;
    name: string;
  };
  allegroProduct?: AllegroProduct;
  // Edit form fields
  deliveryOptions?: Record<string, unknown>;
  paymentOptions?: Record<string, unknown>;
  attributes?: Array<{ id: string; values: string[] }>;
  // Allegro public URL (if available from API)
  publicUrl?: string;
}


const OffersPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [validating, setValidating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedOffer, setEditedOffer] = useState<Partial<Offer> | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncOnSave, setSyncOnSave] = useState(false);
  const [syncingToAllegro, setSyncingToAllegro] = useState(false);
  const [syncingFromAllegro, setSyncingFromAllegro] = useState(false);
  
  // Publish all states
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ offerId: string; status: 'success' | 'failed'; error?: string; allegroOfferId?: string }>;
  } | null>(null);
  const [showPublishResultsModal, setShowPublishResultsModal] = useState(false);
  
  // Create offer states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [products, setProducts] = useState<Array<{ id: string; allegroProductId: string; name?: string; brand?: string }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [newOffer, setNewOffer] = useState({
    title: '',
    description: '',
    categoryId: '',
    price: '',
    quantity: '',
    currency: 'CZK',
    allegroProductId: '',
    syncToAllegro: false,
  });
  
  // Load saved filters from localStorage
  const loadSavedFilters = (): { statusFilter: string; searchQuery: string; categoryFilter: string; page: number } => {
    try {
      const saved = localStorage.getItem('allegro-offers-filters');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load saved filters', error);
    }
    return { statusFilter: '', searchQuery: '', categoryFilter: '', page: 1 };
  };

  // Save filters to localStorage
  const saveFilters = (statusFilter: string, searchQuery: string, categoryFilter: string, page: number) => {
    try {
      localStorage.setItem('allegro-offers-filters', JSON.stringify({
        statusFilter,
        searchQuery,
        categoryFilter,
        page,
      }));
    } catch (error) {
      console.error('Failed to save filters', error);
    }
  };

  // Filters - load from localStorage on mount
  const savedFilters = loadSavedFilters();
  const [statusFilter, setStatusFilter] = useState<string>(savedFilters.statusFilter);
  const [searchQuery, setSearchQuery] = useState<string>(savedFilters.searchQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>(savedFilters.categoryFilter);
  
  // Pagination
  const [page, setPage] = useState<number>(savedFilters.page);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Store all offers for client-side filtering
  const [allOffers, setAllOffers] = useState<Offer[]>([]);

  // Load all offers once on mount (client-side filtering for instant filtering)
  const loadAllOffers = useCallback(async () => {
    setLoading(true);
    try {
      // Load all offers without pagination for client-side filtering
      const response = await api.get('/allegro/offers', { 
        params: { 
          limit: 1000, // Load all offers at once
          page: 1 
        } 
      });
      if (response.data.success) {
        const items = response.data.data.items || [];
        setAllOffers(items);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to load offers', err);
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError('Failed to load offers. Please try again later.');
        }
      } else {
        setError('Failed to load offers. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllOffers();
  }, [loadAllOffers]);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    saveFilters(statusFilter, searchQuery, categoryFilter, page);
  }, [statusFilter, searchQuery, categoryFilter, page]);

  // Client-side filtering - instant!
  useEffect(() => {
    let filtered = [...allOffers];

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(offer => 
        offer.title?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter && statusFilter.trim()) {
      filtered = filtered.filter(offer => offer.status === statusFilter);
    }

    // Apply category filter
    if (categoryFilter && categoryFilter.trim()) {
      filtered = filtered.filter(offer => offer.categoryId === categoryFilter);
    }

    // Calculate pagination
    const totalFiltered = filtered.length;
    const totalPagesFiltered = Math.ceil(totalFiltered / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOffers = filtered.slice(startIndex, endIndex);

    setOffers(paginatedOffers);
    setTotalPages(totalPagesFiltered);
    setTotal(totalFiltered);
  }, [allOffers, searchQuery, statusFilter, categoryFilter, page, limit]);

  const handleViewDetails = async (offer: Offer) => {
    // Use existing offer data immediately (fast response)
    setSelectedOffer(offer);
    setShowDetailModal(true);
    setError(null);
    
    // Only fetch if we don't have rawData (optimization: skip fetch if data is already complete)
    const rawData = offer.rawData as AllegroRawData | undefined;
    const hasCompleteData = rawData && 
      (offer.description || rawData.description) &&
      (offer.images || rawData.images);
    
    if (!hasCompleteData) {
      // Only fetch if data is incomplete
      setLoadingDetail(true);
      try {
        const response = await api.get<{ success: boolean; data: Offer }>(`/allegro/offers/${offer.id}`);
        if (response.data.success && response.data.data) {
          setSelectedOffer(response.data.data);
        } else {
          setError('Failed to load offer details: Invalid response');
        }
      } catch (err) {
        console.error('Failed to load offer details', err);
        const axiosError = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
        const errorMessage = axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to load offer details';
        setError(errorMessage);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      // Data is already complete, no need to fetch
      setLoadingDetail(false);
    }
  };

  const handleValidateOffer = async () => {
    if (!selectedOffer) return;
    
    setValidating(true);
    try {
      const response = await api.post(`/allegro/offers/${selectedOffer.id}/validate`);
      if (response.data.success) {
        // Reload offer details to get updated validation status
        const detailResponse = await api.get(`/allegro/offers/${selectedOffer.id}`);
        if (detailResponse.data.success) {
          setSelectedOffer(detailResponse.data.data);
        }
      }
    } catch (err) {
      console.error('Failed to validate offer', err);
      setError('Failed to validate offer');
    } finally {
      setValidating(false);
    }
  };

  const handleEditOffer = () => {
    if (!selectedOffer) return;
    const description = selectedOffer.description || 
      (typeof selectedOffer.rawData?.description === 'string' ? selectedOffer.rawData.description : '') || '';
    setEditedOffer({
      title: selectedOffer.title,
      description: description,
      price: selectedOffer.price,
      currency: selectedOffer.currency,
      stockQuantity: selectedOffer.stockQuantity,
      status: selectedOffer.status,
      publicationStatus: selectedOffer.publicationStatus,
      categoryId: selectedOffer.categoryId,
      images: Array.isArray(selectedOffer.images) 
        ? selectedOffer.images.map((img: string | ImageItem) => typeof img === 'string' ? img : (img.url || img.path || ''))
        : [],
      deliveryOptions: (selectedOffer.rawData?.delivery || selectedOffer.rawData?.deliveryOptions) as Record<string, unknown> | undefined,
      paymentOptions: (selectedOffer.rawData?.payments || selectedOffer.rawData?.paymentOptions) as Record<string, unknown> | undefined,
      attributes: selectedOffer.rawData?.parameters?.map((p: Parameter) => ({
        id: p.id || '',
        values: Array.isArray(p.values) ? p.values.map((v: ParameterValue | string) => typeof v === 'string' ? v : (v as ParameterValue).name || '') : [],
      })) || [],
    });
    setIsEditMode(true);
    setSyncOnSave(false);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedOffer(null);
    setError(null);
  };

  const handleSyncToAllegro = async () => {
    if (!selectedOffer) return;

    setSyncingToAllegro(true);
    setError(null);
    try {
      const response = await api.post(`/allegro/offers/${selectedOffer.id}/sync-to-allegro`);
      if (response.data.success) {
        const detailResponse = await api.get(`/allegro/offers/${selectedOffer.id}`);
        if (detailResponse.data.success) {
          setSelectedOffer(detailResponse.data.data);
          loadAllOffers();
        }
      }
    } catch (err) {
      console.error('Failed to sync to Allegro', err);
      const axiosError = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
      const errorMessage = axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to sync to Allegro';
      setError(errorMessage);
    } finally {
      setSyncingToAllegro(false);
    }
  };

  const handleSyncFromAllegro = async () => {
    if (!selectedOffer) return;

    setSyncingFromAllegro(true);
    setError(null);
    try {
      const response = await api.post(`/allegro/offers/${selectedOffer.id}/sync-from-allegro`);
      if (response.data.success) {
        const detailResponse = await api.get(`/allegro/offers/${selectedOffer.id}`);
        if (detailResponse.data.success) {
          setSelectedOffer(detailResponse.data.data);
          loadAllOffers();
        }
      }
    } catch (err) {
      console.error('Failed to sync from Allegro', err);
      const axiosError = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
      const errorMessage = axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to sync from Allegro';
      setError(errorMessage);
    } finally {
      setSyncingFromAllegro(false);
    }
  };

  const handleSaveOffer = async () => {
    if (!selectedOffer || !editedOffer) return;

    setSaving(true);
    setError(null);
    try {
      const updateData: Record<string, unknown> = {};
      
      // Track which fields are actually being changed
      const changedFields = new Set<string>();
      
      if (editedOffer.title !== undefined && editedOffer.title !== selectedOffer.title) {
        updateData.title = editedOffer.title;
        changedFields.add('title');
      }
      if (editedOffer.description !== undefined && editedOffer.description !== selectedOffer.description) {
        updateData.description = editedOffer.description;
        changedFields.add('description');
      }
      if (editedOffer.price !== undefined && editedOffer.price !== selectedOffer.price) {
        updateData.price = editedOffer.price;
        changedFields.add('price');
      }
      if (editedOffer.currency !== undefined && editedOffer.currency !== selectedOffer.currency) {
        updateData.currency = editedOffer.currency;
        changedFields.add('currency');
      }
      if (editedOffer.stockQuantity !== undefined && editedOffer.stockQuantity !== selectedOffer.stockQuantity) {
        updateData.stockQuantity = editedOffer.stockQuantity;
        changedFields.add('stockQuantity');
      }
      if (editedOffer.status !== undefined && editedOffer.status !== selectedOffer.status) {
        updateData.status = editedOffer.status;
        changedFields.add('status');
      }
      if (editedOffer.publicationStatus !== undefined && editedOffer.publicationStatus !== selectedOffer.publicationStatus) {
        updateData.publicationStatus = editedOffer.publicationStatus;
        changedFields.add('publicationStatus');
      }
      if (editedOffer.categoryId !== undefined && editedOffer.categoryId !== selectedOffer.categoryId) {
        updateData.categoryId = editedOffer.categoryId;
        changedFields.add('categoryId');
      }
      if (editedOffer.images !== undefined) {
        const currentImages = Array.isArray(selectedOffer.images) 
          ? selectedOffer.images.map((img: string | ImageItem) => typeof img === 'string' ? img : (img.url || img.path || ''))
          : [];
        const newImages = Array.isArray(editedOffer.images) ? editedOffer.images : [];
        if (JSON.stringify(currentImages) !== JSON.stringify(newImages)) {
          updateData.images = editedOffer.images;
          changedFields.add('images');
        }
      }
      if (editedOffer.deliveryOptions !== undefined) {
        updateData.deliveryOptions = editedOffer.deliveryOptions;
        changedFields.add('deliveryOptions');
      }
      if (editedOffer.paymentOptions !== undefined) {
        updateData.paymentOptions = editedOffer.paymentOptions;
        changedFields.add('paymentOptions');
      }
      
      // If only stockQuantity is being updated, use the dedicated stock endpoint to avoid attribute validation issues
      if (changedFields.size === 1 && changedFields.has('stockQuantity')) {
        try {
          const response = await api.put(`/allegro/offers/${selectedOffer.id}/stock`, {
            quantity: editedOffer.stockQuantity,
          });
          if (response.data.success) {
            // Reload offer details to get updated data
            const detailResponse = await api.get(`/allegro/offers/${selectedOffer.id}`);
            if (detailResponse.data.success) {
              setSelectedOffer(detailResponse.data.data);
              setIsEditMode(false);
              setEditedOffer(null);
              // Refresh offers list to show updated data
              loadAllOffers();
            }
          }
        } catch (err) {
          console.error('Failed to update stock', err);
          const axiosError = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
          const errorMessage = axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to update stock';
          setError(errorMessage);
        } finally {
          setSaving(false);
        }
        return;
      }
      
      // Only include attributes if they were explicitly modified (not just initialized from rawData)
      // This prevents validation errors when attributes have nested structures that don't match the DTO
      // Only send attributes if other fields besides stockQuantity are being changed, or if attributes were explicitly edited
      if (editedOffer.attributes !== undefined && Array.isArray(editedOffer.attributes) && editedOffer.attributes.length > 0) {
        // Check if attributes were actually modified (not just initialized)
        const originalAttributes = selectedOffer.rawData?.parameters?.map((p: Parameter) => ({
          id: p.id || '',
          values: Array.isArray(p.values) ? p.values.map((v: ParameterValue | string) => typeof v === 'string' ? v : (v as ParameterValue).name || '') : [],
        })) || [];
        
        const attributesChanged = JSON.stringify(originalAttributes) !== JSON.stringify(editedOffer.attributes);
        
        // Only include attributes if they were changed AND other fields are being updated (not just stockQuantity)
        // OR if we're updating categoryId (which might require attributes)
        if (attributesChanged && (changedFields.size > 1 || changedFields.has('categoryId') || changedFields.has('title'))) {
          // Filter out any attributes with nested 'property' structure and ensure correct format
          const validAttributes = editedOffer.attributes
            .map((attr: AttributeInput): { id: string; values: string[] } | null => {
              // If attribute has nested 'property' object, extract id and values from it
              if (attr.property && typeof attr.property === 'object') {
                return {
                  id: attr.property.id || attr.id || '',
                  values: Array.isArray(attr.property.values) ? attr.property.values : (attr.values || []),
                };
              }
              // Otherwise, use the attribute as-is if it has the correct structure
              if (attr.id && Array.isArray(attr.values)) {
                return {
                  id: attr.id,
                  values: attr.values,
                };
              }
              return null;
            })
            .filter((attr): attr is { id: string; values: string[] } => attr !== null && attr.id !== undefined && Array.isArray(attr.values));
          
          // Only include attributes if we have valid ones
          if (validAttributes.length > 0) {
            updateData.attributes = validAttributes;
          }
        }
      }

      if (syncOnSave) {
        updateData.syncToAllegro = true;
      }

      const response = await api.put(`/allegro/offers/${selectedOffer.id}`, updateData);
      if (response.data.success) {
        // Reload offer details to get updated data
        const detailResponse = await api.get(`/allegro/offers/${selectedOffer.id}`);
        if (detailResponse.data.success) {
          setSelectedOffer(detailResponse.data.data);
          setIsEditMode(false);
          setEditedOffer(null);
          // Refresh offers list to show updated data
          loadAllOffers();
        }
      }
    } catch (err) {
      console.error('Failed to save offer', err);
      const axiosError = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
      const errorMessage = axiosError.response?.data?.error?.message || (err as Error).message || 'Failed to save offer';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
      case 'INACTIVE':
        return 'text-gray-600 bg-gray-100';
      case 'ENDED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getPublicationStatusColor = (status?: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'text-green-600 bg-green-100';
      case 'INACTIVE':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const renderImages = (images: ImageArray | undefined) => {
    if (!images) return null;
    
    const imageArray = Array.isArray(images) ? images : [];
    if (imageArray.length === 0) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
        {imageArray.map((img: string | ImageItem, idx: number) => {
          const url = typeof img === 'string' ? img : (img as ImageItem).url || (img as ImageItem).path || '';
          return (
            <img
              key={idx}
              src={url}
              alt={`Offer image ${idx + 1}`}
              className="w-full h-32 object-cover rounded border"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderRawData = (rawData: AllegroRawData | undefined) => {
    if (!rawData) return null;
    
    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Raw JSON Data</h4>
        <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      </div>
    );
  };

  const renderAttributes = (rawData: AllegroRawData | undefined) => {
    if (!rawData?.parameters) return null;
    
    const parameters = Array.isArray(rawData.parameters) ? rawData.parameters : [];
    if (parameters.length === 0) return null;

    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Attributes / Parameters</h4>
        <div className="space-y-2">
          {parameters.map((param: Parameter, idx: number) => (
            <div key={idx} className="border-b pb-2">
              <div className="font-medium">{param.name || param.id}</div>
              <div className="text-sm text-gray-600">
                {Array.isArray(param.values) 
                  ? param.values.map((v: ParameterValue) => v.name || String(v)).join(', ')
                  : param.values || param.value || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSellingMode = (rawData: AllegroRawData | undefined) => {
    if (!rawData?.sellingMode) return null;

    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Selling Mode</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Format</div>
            <div className="font-medium">{rawData.sellingMode.format || '-'}</div>
          </div>
          {rawData.sellingMode.price && (
            <>
              <div>
                <div className="text-sm text-gray-600">Price</div>
                <div className="font-medium">
                  {rawData.sellingMode.price.amount} {rawData.sellingMode.price.currency}
                </div>
              </div>
              {rawData.sellingMode.price.minimalPrice && (
                <div>
                  <div className="text-sm text-gray-600">Minimal Price</div>
                  <div className="font-medium">
                    {rawData.sellingMode.price.minimalPrice.amount} {rawData.sellingMode.price.minimalPrice.currency}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAfterSalesServices = (rawData: AllegroRawData | undefined) => {
    if (!rawData?.afterSalesServices) return null;

    const services = rawData.afterSalesServices;
    const hasServices = services.impatient || services.returnPolicy || services.warranty;

    if (!hasServices) return null;

    // Helper to safely render value (handles strings, objects, arrays)
    const renderValue = (value: unknown): string => {
      if (value === null || value === undefined) return '-';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) return value.map(v => renderValue(v)).join(', ');
      if (typeof value === 'object' && value !== null) {
        // For objects, try to extract meaningful fields
        const obj = value as Record<string, unknown>;
        if (obj.type) return String(obj.type);
        if (obj.period) return String(obj.period);
        if (obj.name) return String(obj.name);
        // Fallback to JSON string
        return JSON.stringify(value, null, 2);
      }
      return String(value);
    };

    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">After-Sales Services</h4>
        <div className="space-y-2">
          {services.impatient && (
            <div>
              <div className="text-sm text-gray-600">Impatient</div>
              <div className="text-sm">{renderValue(services.impatient)}</div>
            </div>
          )}
          {services.returnPolicy && (
            <div>
              <div className="text-sm text-gray-600">Return Policy</div>
              <div className="text-sm">{renderValue(services.returnPolicy)}</div>
            </div>
          )}
          {services.warranty && (
            <div>
              <div className="text-sm text-gray-600">Warranty</div>
              <div className="text-sm">{renderValue(services.warranty)}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderVariations = (rawData: AllegroRawData | undefined) => {
    if (!rawData?.variants || !Array.isArray(rawData.variants) || rawData.variants.length === 0) return null;

    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Variations</h4>
        <div className="space-y-3">
          {rawData.variants.map((variant: Variant, idx: number) => (
            <div key={idx} className="border rounded p-3">
              <div className="font-medium mb-2">Variant {idx + 1}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {variant.name && (
                  <div>
                    <span className="text-gray-600">Name: </span>
                    <span>{variant.name}</span>
                  </div>
                )}
                {variant.quantity && (
                  <div>
                    <span className="text-gray-600">Quantity: </span>
                    <span>{variant.quantity}</span>
                  </div>
                )}
                {variant.price && (
                  <div>
                    <span className="text-gray-600">Price: </span>
                    <span>{variant.price.amount} {variant.price.currency}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPublicationDetails = (rawData: AllegroRawData | undefined) => {
    if (!rawData?.publication) return null;

    const pub = rawData.publication;
    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">Publication Details</h4>
        <div className="grid grid-cols-2 gap-4">
          {pub.startedAt && (
            <div>
              <div className="text-sm text-gray-600">Started At</div>
              <div className="font-medium">{new Date(pub.startedAt).toLocaleString()}</div>
            </div>
          )}
          {pub.endedAt && (
            <div>
              <div className="text-sm text-gray-600">Ended At</div>
              <div className="font-medium">{new Date(pub.endedAt).toLocaleString()}</div>
            </div>
          )}
          {pub.endingAt && (
            <div>
              <div className="text-sm text-gray-600">Ending At</div>
              <div className="font-medium">{new Date(pub.endingAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDeliveryPayment = (rawData: AllegroRawData | undefined) => {
    if (!rawData) return null;

    const hasDelivery = rawData.delivery || rawData.deliveryOptions;
    const hasPayment = rawData.payments || rawData.paymentOptions;

    if (!hasDelivery && !hasPayment) return null;

    return (
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Delivery & Payment</h3>
        <div className="grid grid-cols-2 gap-4">
          {hasDelivery && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Delivery Options</div>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(rawData.delivery || rawData.deliveryOptions, null, 2)}
              </pre>
            </div>
          )}
          {hasPayment && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Payment Options</div>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(rawData.payments || rawData.paymentOptions, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Load products for selection
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const response = await api.get('/allegro/products', { params: { limit: 100, page: 1 } });
      if (response.data.success) {
        const items = (response.data.data.items || []) as AllegroProduct[];
        setProducts(items.map((p: AllegroProduct) => ({ id: p.id, allegroProductId: p.allegroProductId, name: p.name, brand: p.brand })));
      }
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // Open create offer modal
  const openCreateOffer = () => {
    setNewOffer({
      title: '',
      description: '',
      categoryId: '',
      price: '',
      quantity: '',
      currency: 'CZK',
      allegroProductId: '',
      syncToAllegro: false,
    });
    setShowCreateModal(true);
    loadProducts();
  };

  // Create offer
  const handleCreateOffer = async () => {
    console.log('[handleCreateOffer] Called', { newOffer });
    
    if (!newOffer.title.trim()) {
      console.log('[handleCreateOffer] Validation failed: Title is required');
      setError('Title is required');
      return;
    }

    console.log('[handleCreateOffer] Starting creation...');
    setCreatingOffer(true);
    setError(null);
    try {
      const payload: {
        title: string;
        description?: string;
        categoryId?: string;
        price?: number;
        quantity?: number;
        currency: string;
        allegroProductId?: string;
        syncToAllegro: boolean;
      } = {
        title: newOffer.title,
        description: newOffer.description || undefined,
        categoryId: newOffer.categoryId || undefined,
        price: newOffer.price ? parseFloat(newOffer.price) : undefined,
        quantity: newOffer.quantity ? parseInt(newOffer.quantity) : undefined,
        currency: newOffer.currency,
        allegroProductId: newOffer.allegroProductId || undefined,
        syncToAllegro: newOffer.syncToAllegro,
      };

      console.log('[handleCreateOffer] Sending payload:', payload);
      await api.post('/allegro/offers', payload);
      console.log('[handleCreateOffer] Success!');
      setShowCreateModal(false);
      await loadAllOffers();
    } catch (err) {
      console.error('[handleCreateOffer] Failed to create offer', err);
      const axiosErr = err as AxiosError & { serviceErrorMessage?: string };
      setError(axiosErr.serviceErrorMessage || axiosErr.message || 'Failed to create offer');
    } finally {
      setCreatingOffer(false);
    }
  };

  // Publish all offers
  const handlePublishAll = async () => {
    if (total === 0) {
      setError('No offers to publish');
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      // Get IDs of all filtered offers (use allOffers which contains all filtered results)
      const filteredOffers = allOffers.filter((offer) => {
        // Apply same filters as the client-side filtering
        if (searchQuery && searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          if (!offer.title?.toLowerCase().includes(query)) {
            return false;
          }
        }
        if (statusFilter && statusFilter.trim()) {
          if (offer.status !== statusFilter) {
            return false;
          }
        }
        if (categoryFilter && categoryFilter.trim()) {
          if (offer.categoryId !== categoryFilter) {
            return false;
          }
        }
        return true;
      });

      const offerIds = filteredOffers.map((offer) => offer.id);

      const response = await api.post('/allegro/offers/publish-all', {
        offerIds,
      });

      if (response.data.success) {
        setPublishResults(response.data.data);
        setShowPublishResultsModal(true);
        // Refresh offers list
        await loadAllOffers();
      } else {
        setError(response.data.error?.message || 'Failed to publish offers');
      }
    } catch (err) {
      console.error('Failed to publish offers', err);
      const axiosErr = err as AxiosError & { response?: { data?: { error?: { message?: string } } } };
      const errorMessage =
        axiosErr.response?.data?.error?.message ||
        (axiosErr as any).serviceErrorMessage ||
        axiosErr.message ||
        'Failed to publish offers';
      setError(errorMessage);
    } finally {
      setPublishing(false);
    }
  };

  if (loading && offers.length === 0) {
    return <div>Loading offers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Offers</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            Total: {total} offers
          </div>
          <Button
            onClick={handlePublishAll}
            disabled={publishing || total === 0}
            variant="primary"
          >
            {publishing ? 'Publishing...' : `🚀 Publish All (${total})`}
          </Button>
          <Button onClick={openCreateOffer}>Add Offer</Button>
        </div>
      </div>

      {/* Filters */}
      <Card title="Filters">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Title
            </label>
            <Input
              type="text"
              placeholder="Search offers..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // Reset to first page on filter change
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ENDED">Ended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category ID
            </label>
            <Input
              type="text"
              placeholder="Category ID..."
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded whitespace-pre-line">
          <div className="font-semibold mb-2">Error:</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      <Card>
        {offers.length === 0 ? (
          <p className="text-gray-600">No offers found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Publication</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Validation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sync Source</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Synced</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {offers.map((offer) => (
                    <tr key={offer.id}>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={offer.title}>
                        {offer.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {offer.price} {offer.currency}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {offer.stockQuantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(offer.status)}`}>
                          {offer.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {offer.publicationStatus && (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPublicationStatusColor(offer.publicationStatus)}`}>
                            {offer.publicationStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {offer.product ? `${offer.product.code} - ${offer.product.name}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {offer.validationStatus ? (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            offer.validationStatus === 'READY' ? 'bg-green-100 text-green-800' :
                            offer.validationStatus === 'WARNINGS' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {offer.validationStatus}
                            {offer.validationErrors && offer.validationErrors.length > 0 && (
                              <span className="ml-1">({offer.validationErrors.length})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {offer.syncSource || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {offer.lastSyncedAt ? new Date(offer.lastSyncedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => handleViewDetails(offer)}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedOffer(null);
          setIsEditMode(false);
          setEditedOffer(null);
          setError(null);
        }}
        title={selectedOffer?.title || 'Offer Details'}
        size="xlarge"
      >
        {loadingDetail ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-600">Loading offer details...</div>
          </div>
        ) : selectedOffer ? (
          <div className="space-y-4">
            {/* Edit/View Mode Toggle */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">{isEditMode ? 'Edit Offer' : 'Offer Details'}</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                {!isEditMode ? (
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleEditOffer}
                  >
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="small"
                      onClick={handleSaveOffer}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleSyncFromAllegro}
                  disabled={syncingFromAllegro || saving}
                >
                  {syncingFromAllegro ? 'Syncing from Allegro...' : 'Sync from Allegro'}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={handleSyncToAllegro}
                  disabled={syncingToAllegro || saving}
                >
                  {syncingToAllegro ? 'Syncing to Allegro...' : 'Sync to Allegro'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            {isEditMode && editedOffer ? (
              /* Edit Form */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="syncOnSave"
                    className="h-4 w-4"
                    checked={syncOnSave}
                    onChange={(e) => setSyncOnSave(e.target.checked)}
                  />
                  <label htmlFor="syncOnSave" className="text-sm text-gray-700">
                    Also sync to Allegro on save
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <Input
                    type="text"
                    value={editedOffer.title || ''}
                    onChange={(e) => setEditedOffer({ ...editedOffer, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={6}
                    value={editedOffer.description || 
                      (typeof selectedOffer?.rawData?.description === 'string' ? selectedOffer.rawData.description : '') || ''}
                    onChange={(e) => setEditedOffer({ ...editedOffer, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedOffer.price || 0}
                      onChange={(e) => setEditedOffer({ ...editedOffer, price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={editedOffer.currency || 'PLN'}
                      onChange={(e) => setEditedOffer({ ...editedOffer, currency: e.target.value })}
                    >
                      <option value="PLN">PLN</option>
                      <option value="CZK">CZK</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                    <Input
                      type="number"
                      value={editedOffer.stockQuantity || 0}
                      onChange={(e) => setEditedOffer({ ...editedOffer, stockQuantity: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={editedOffer.status || 'ACTIVE'}
                      onChange={(e) => setEditedOffer({ ...editedOffer, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="ENDED">Ended</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Publication Status</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={editedOffer.publicationStatus || 'INACTIVE'}
                      onChange={(e) => setEditedOffer({ ...editedOffer, publicationStatus: e.target.value })}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category ID</label>
                    <Input
                      type="text"
                      value={editedOffer.categoryId || ''}
                      onChange={(e) => setEditedOffer({ ...editedOffer, categoryId: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Images (URLs, one per line)</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={4}
                    value={Array.isArray(editedOffer.images) ? editedOffer.images.join('\n') : ''}
                    onChange={(e) => setEditedOffer({ 
                      ...editedOffer, 
                      images: e.target.value.split('\n').filter(url => url.trim()) 
                    })}
                    placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                  />
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
            {/* Core Fields */}
            <div>
              <h3 className="font-semibold mb-2">Core Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Allegro Offer ID</div>
                  <div className="font-medium flex items-center gap-2">
                    {selectedOffer.allegroOfferId}
                    <a
                      href={(() => {
                        // Try to get URL from various sources
                        const rawData = selectedOffer.rawData as AllegroRawData | undefined;
                        const rawDataRecord = rawData as Record<string, unknown> | undefined;
                        const url = selectedOffer.publicUrl || 
                          (rawDataRecord && typeof rawDataRecord.url === 'string' ? rawDataRecord.url : undefined) ||
                          (rawDataRecord && typeof rawDataRecord.publicUrl === 'string' ? rawDataRecord.publicUrl : undefined) ||
                          (rawDataRecord && typeof rawDataRecord.webUrl === 'string' ? rawDataRecord.webUrl : undefined) ||
                          (rawDataRecord?.external && typeof rawDataRecord.external === 'object' && rawDataRecord.external !== null && 'url' in rawDataRecord.external && typeof (rawDataRecord.external as Record<string, unknown>).url === 'string' ? (rawDataRecord.external as Record<string, unknown>).url as string : undefined) ||
                          (rawDataRecord?.listing && typeof rawDataRecord.listing === 'object' && rawDataRecord.listing !== null && 'url' in rawDataRecord.listing && typeof (rawDataRecord.listing as Record<string, unknown>).url === 'string' ? (rawDataRecord.listing as Record<string, unknown>).url as string : undefined);
                        
                        // If we have a URL, use it (might be full URL or relative)
                        if (url) {
                          // If it's already a full URL, use it as-is
                          if (url.startsWith('http://') || url.startsWith('https://')) {
                            return url;
                          }
                          // If it's a relative URL, prepend https://allegro.cz
                          if (url.startsWith('/')) {
                            return `https://allegro.cz${url}`;
                          }
                          // Otherwise assume it's a full URL
                          return url;
                        }
                        
                        // Construct URL using produkt format: /produkt/{slug}-{productId}?offerId={offerId}
                        // Extract product ID from rawData.productSet[0].product.id
                        let productId: string | undefined;
                        let productName: string | undefined;
                        
                        if (rawDataRecord?.productSet && Array.isArray(rawDataRecord.productSet) && rawDataRecord.productSet.length > 0) {
                          const productSet = rawDataRecord.productSet[0] as Record<string, unknown>;
                          if (productSet.product && typeof productSet.product === 'object' && productSet.product !== null) {
                            const product = productSet.product as Record<string, unknown>;
                            productId = typeof product.id === 'string' ? product.id : undefined;
                            productName = typeof product.name === 'string' ? product.name : undefined;
                          }
                        }
                        
                        // Helper function to generate URL-friendly slug from text
                        const generateSlug = (text: string): string => {
                          return text
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
                            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
                            .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
                            .substring(0, 100); // Limit length
                        };
                        
                        // If we have product ID, construct the proper produkt URL
                        if (productId) {
                          // Use product name if available, otherwise use offer title
                          const nameForSlug = productName || selectedOffer.title || 'produkt';
                          const slug = generateSlug(nameForSlug);
                          return `https://allegro.cz/produkt/${slug}-${productId}?offerId=${selectedOffer.allegroOfferId}`;
                        }
                        
                        // Fallback: use oferta format (older format, still works but less SEO-friendly)
                        return `https://allegro.cz/oferta/${selectedOffer.allegroOfferId}`;
                      })()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      (View on Allegro ↗)
                    </a>
                    <a
                      href={`https://allegro.cz/nabidka/${selectedOffer.allegroOfferId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      (View on Allegro (nabidka) ↗)
                    </a>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Category ID</div>
                  <div className="font-medium">{selectedOffer.categoryId}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Price</div>
                  <div className="font-medium">{selectedOffer.price} {selectedOffer.currency}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Stock Quantity</div>
                  <div className="font-medium">{selectedOffer.stockQuantity}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Status</div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedOffer.status)}`}>
                    {selectedOffer.status}
                  </span>
                </div>
                {selectedOffer.publicationStatus && (
                  <div>
                    <div className="text-sm text-gray-600">Publication Status</div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPublicationStatusColor(selectedOffer.publicationStatus)}`}>
                      {selectedOffer.publicationStatus}
                    </span>
                  </div>
                )}
                {selectedOffer.lastSyncedAt && (
                  <div>
                    <div className="text-sm text-gray-600">Last Synced</div>
                    <div className="font-medium">{new Date(selectedOffer.lastSyncedAt).toLocaleString()}</div>
                  </div>
                )}
                {selectedOffer.syncSource && (
                  <div>
                    <div className="text-sm text-gray-600">Sync Source</div>
                    <div className="font-medium">{selectedOffer.syncSource}</div>
                  </div>
                )}
            {selectedOffer.allegroProduct && (
              <div className="col-span-2 border-t pt-3 mt-2">
                <h3 className="font-semibold mb-2">Allegro Product</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Allegro Product ID</div>
                    <div className="font-medium">{selectedOffer.allegroProduct.allegroProductId}</div>
                  </div>
                  {selectedOffer.allegroProduct.name && (
                    <div>
                      <div className="text-sm text-gray-600">Name</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.name}</div>
                    </div>
                  )}
                  {selectedOffer.allegroProduct.brand && (
                    <div>
                      <div className="text-sm text-gray-600">Brand</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.brand}</div>
                    </div>
                  )}
                  {selectedOffer.allegroProduct.manufacturerCode && (
                    <div>
                      <div className="text-sm text-gray-600">Manufacturer Code</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.manufacturerCode}</div>
                    </div>
                  )}
                  {selectedOffer.allegroProduct.ean && (
                    <div>
                      <div className="text-sm text-gray-600">EAN</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.ean}</div>
                    </div>
                  )}
                  {selectedOffer.allegroProduct.publicationStatus && (
                    <div>
                      <div className="text-sm text-gray-600">Publication Status</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.publicationStatus}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-gray-600">AI Co-Created</div>
                    <div className="font-medium">{selectedOffer.allegroProduct.isAiCoCreated ? 'Yes' : 'No'}</div>
                  </div>
                  {selectedOffer.allegroProduct.marketedBeforeGPSR !== null && selectedOffer.allegroProduct.marketedBeforeGPSR !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600">Marketed before GPSR</div>
                      <div className="font-medium">{selectedOffer.allegroProduct.marketedBeforeGPSR ? 'Yes' : 'No'}</div>
                    </div>
                  )}
                </div>

                {selectedOffer.allegroProduct.parameters && selectedOffer.allegroProduct.parameters.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm text-gray-600 mb-1">Parameters</div>
                    <div className="border rounded p-2 max-h-48 overflow-auto text-sm space-y-1">
                      {selectedOffer.allegroProduct.parameters.map((param) => {
                        const renderValues = () => {
                          if (!param.values) return '—';
                          if (Array.isArray(param.values)) {
                            return (param.values as unknown[]).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
                          }
                          return typeof param.values === 'string' ? param.values : JSON.stringify(param.values);
                        };
                        return (
                          <div key={`${param.parameterId}-${param.name || ''}`}>
                            <span className="font-medium">{param.name || param.parameterId}:</span>{' '}
                            <span>{renderValues()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
                {selectedOffer.validationStatus && (
                  <div>
                    <div className="text-sm text-gray-600">Validation Status</div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      selectedOffer.validationStatus === 'READY' ? 'bg-green-100 text-green-800' :
                      selectedOffer.validationStatus === 'WARNINGS' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {selectedOffer.validationStatus}
                    </span>
                  </div>
                )}
                {selectedOffer.lastValidatedAt && (
                  <div>
                    <div className="text-sm text-gray-600">Last Validated</div>
                    <div className="font-medium">{new Date(selectedOffer.lastValidatedAt).toLocaleString()}</div>
                  </div>
                )}
                {selectedOffer.product && (
                  <div>
                    <div className="text-sm text-gray-600">Linked Product</div>
                    <div className="font-medium">{selectedOffer.product.code} - {selectedOffer.product.name}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Validation Errors */}
            {selectedOffer.validationErrors && selectedOffer.validationErrors.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center justify-between">
                  <span>Validation Issues</span>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleValidateOffer}
                    disabled={validating}
                  >
                    {validating ? 'Validating...' : 'Re-validate'}
                  </Button>
                </h3>
                <div className="space-y-2">
                  {selectedOffer.validationErrors.map((error, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded border ${
                        error.severity === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-semibold ${
                          error.severity === 'error' ? 'text-red-700' : 'text-yellow-700'
                        }`}>
                          {error.severity === 'error' ? '❌' : '⚠️'}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {error.type}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {error.message}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validate Button (if no errors shown) */}
            {(!selectedOffer.validationErrors || selectedOffer.validationErrors.length === 0) && (
              <div>
                <Button
                  variant="secondary"
                  onClick={handleValidateOffer}
                  disabled={validating}
                >
                  {validating ? 'Validating...' : 'Validate Offer'}
                </Button>
              </div>
            )}

            {/* Description */}
            {(selectedOffer.description || selectedOffer.rawData?.description) && (
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <div 
                  className="prose max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: selectedOffer.description || selectedOffer.rawData?.description || '' }}
                />
              </div>
            )}

            {/* Images */}
            {renderImages(selectedOffer.images || selectedOffer.rawData?.images)}

            {/* Selling Mode */}
            {renderSellingMode(selectedOffer.rawData)}

            {/* Attributes */}
            {renderAttributes(selectedOffer.rawData)}

            {/* Variations */}
            {renderVariations(selectedOffer.rawData)}

            {/* Publication Details */}
            {renderPublicationDetails(selectedOffer.rawData)}

            {/* Delivery/Payment Options */}
            {renderDeliveryPayment(selectedOffer.rawData)}

            {/* After-Sales Services */}
            {renderAfterSalesServices(selectedOffer.rawData)}

            {/* Raw JSON */}
            {renderRawData(selectedOffer.rawData)}
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Create Offer Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Offer">
        <div className="space-y-4">
          {error && <div className="text-red-600 text-sm">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.title}
                onChange={(e) => setNewOffer({ ...newOffer, title: e.target.value })}
                placeholder="Offer title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category ID</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.categoryId}
                onChange={(e) => setNewOffer({ ...newOffer, categoryId: e.target.value })}
                placeholder="Category ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.price}
                onChange={(e) => setNewOffer({ ...newOffer, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.quantity}
                onChange={(e) => setNewOffer({ ...newOffer, quantity: e.target.value })}
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.currency}
                onChange={(e) => setNewOffer({ ...newOffer, currency: e.target.value })}
              >
                <option value="CZK">CZK</option>
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newOffer.allegroProductId}
                onChange={(e) => setNewOffer({ ...newOffer, allegroProductId: e.target.value })}
                disabled={loadingProducts}
              >
                <option value="">None</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.brand || p.allegroProductId}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={4}
              value={newOffer.description}
              onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
              placeholder="Offer description"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="syncToAllegro"
              checked={newOffer.syncToAllegro}
              onChange={(e) => setNewOffer({ ...newOffer, syncToAllegro: e.target.checked })}
            />
            <label htmlFor="syncToAllegro" className="text-sm text-gray-700">
              Sync to Allegro API (if unchecked, creates local-only offer)
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={creatingOffer} type="button">
              Cancel
            </Button>
            <Button onClick={handleCreateOffer} disabled={creatingOffer} type="button">
              {creatingOffer ? 'Creating...' : 'Create Offer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Publish Results Modal */}
      <Modal
        isOpen={showPublishResultsModal}
        onClose={() => {
          setShowPublishResultsModal(false);
          setPublishResults(null);
        }}
        title="Publish Results"
      >
        {publishResults && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-lg font-semibold mb-2">Summary</div>
              <div className="space-y-1">
                <div>
                  <span className="font-medium">Total:</span> {publishResults.total} offers
                </div>
                <div className="text-green-600">
                  <span className="font-medium">Successful:</span> {publishResults.successful} offers
                </div>
                {publishResults.failed > 0 && (
                  <div className="text-red-600">
                    <span className="font-medium">Failed:</span> {publishResults.failed} offers
                  </div>
                )}
              </div>
            </div>

            {publishResults.failed > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2 text-red-600">Failed Offers:</div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {publishResults.results
                    .filter((r) => r.status === 'failed')
                    .map((result) => (
                      <div key={result.offerId} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                        <div className="font-medium">Offer ID: {result.offerId}</div>
                        {result.allegroOfferId && (
                          <div className="text-xs text-gray-600">Allegro ID: {result.allegroOfferId}</div>
                        )}
                        <div className="text-red-700 mt-1">{result.error}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {publishResults.successful > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2 text-green-600">Successful Offers:</div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {publishResults.results
                    .filter((r) => r.status === 'success')
                    .map((result) => (
                      <div key={result.offerId} className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <div className="font-medium">Offer ID: {result.offerId}</div>
                        {result.allegroOfferId && (
                          <div className="text-xs text-gray-600">Allegro ID: {result.allegroOfferId}</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPublishResultsModal(false);
                  setPublishResults(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OffersPage;


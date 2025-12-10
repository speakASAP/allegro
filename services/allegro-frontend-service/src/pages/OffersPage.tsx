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
  images?: ImageArray;
  rawData?: AllegroRawData;
  product?: {
    id: string;
    code: string;
    name: string;
  };
}

interface OfferQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  categoryId?: string;
}

const OffersPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params: OfferQueryParams = {
        page,
        limit,
      };
      if (statusFilter) {
        params.status = statusFilter;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (categoryFilter) {
        params.categoryId = categoryFilter;
      }

      const response = await api.get('/allegro/offers', { params });
      if (response.data.success) {
        setOffers(response.data.data.items || []);
        setTotalPages(response.data.data.pagination?.totalPages || 1);
        setTotal(response.data.data.pagination?.total || 0);
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
  }, [page, statusFilter, searchQuery, categoryFilter, limit]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const handleViewDetails = async (offer: Offer) => {
    setSelectedOffer(offer);
    setShowDetailModal(true);
    
    // If rawData is not loaded, fetch full offer details
    if (!offer.rawData) {
      setLoadingDetail(true);
      try {
        const response = await api.get(`/allegro/offers/${offer.id}`);
        if (response.data.success) {
          setSelectedOffer(response.data.data);
        }
      } catch (err) {
        console.error('Failed to load offer details', err);
      } finally {
        setLoadingDetail(false);
      }
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

    return (
      <div className="mt-4">
        <h4 className="font-semibold mb-2">After-Sales Services</h4>
        <div className="space-y-2">
          {services.impatient && (
            <div>
              <div className="text-sm text-gray-600">Impatient</div>
              <div className="text-sm">{services.impatient}</div>
            </div>
          )}
          {services.returnPolicy && (
            <div>
              <div className="text-sm text-gray-600">Return Policy</div>
              <div className="text-sm">{services.returnPolicy}</div>
            </div>
          )}
          {services.warranty && (
            <div>
              <div className="text-sm text-gray-600">Warranty</div>
              <div className="text-sm">{services.warranty}</div>
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

  if (loading && offers.length === 0) {
    return <div>Loading offers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Offers</h2>
        <div className="text-sm text-gray-600">
          Total: {total} offers
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
                setPage(1);
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
        }}
        title={selectedOffer?.title || 'Offer Details'}
        size="xlarge"
      >
        {loadingDetail ? (
          <div>Loading offer details...</div>
        ) : selectedOffer ? (
          <div className="space-y-4">
            {/* Core Fields */}
            <div>
              <h3 className="font-semibold mb-2">Core Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Allegro Offer ID</div>
                  <div className="font-medium flex items-center gap-2">
                    {selectedOffer.allegroOfferId}
                    <a
                      href={`https://allegro.pl/oferta/${selectedOffer.allegroOfferId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      (View on Allegro ↗)
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
                {selectedOffer.product && (
                  <div>
                    <div className="text-sm text-gray-600">Linked Product</div>
                    <div className="font-medium">{selectedOffer.product.code} - {selectedOffer.product.name}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {selectedOffer.description && (
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <div 
                  className="prose max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: selectedOffer.description }}
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
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default OffersPage;


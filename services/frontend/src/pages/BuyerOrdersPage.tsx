/**
 * Buyer order cabinet page.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import api from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/useAuth';

interface CentralOrderReadModel {
  state: 'available' | 'unknown' | 'stale';
  displayStatus?: string | null;
  lifecycleStage?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  warehouseHandoffStatus?: string | null;
  reason?: string | null;
}

const CENTRAL_LIFECYCLE_LABELS: Record<string, string> = {
  ordered_unpaid: "Ordered / awaiting payment",
  payment_failed: "Payment failed",
  paid_not_delivered: "Paid / awaiting delivery",
  warehouse_fulfillment_requested: "Sent to warehouse",
  warehouse_collecting: "Warehouse collecting",
  warehouse_forming: "Warehouse forming shipment",
  warehouse_formed: "Warehouse shipment ready",
  handed_to_delivery: "Handed to delivery",
  in_delivery: "In delivery",
  received: "Received",
  not_received: "Not received",
  returned: "Returned",
  cancelled: "Cancelled",
};

interface BuyerOrderItem {
  catalogProductId?: string | null;
  quantity: number;
  price: number | string;
  totalPrice: number | string;
}

interface BuyerOrder {
  id: string;
  allegroOrderId: string;
  orderedAt?: string | null;
  totalPrice: number | string;
  currency?: string;
  status?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  deliveryMethod?: string | null;
  trackingStatus?: string | null;
  lineItemsCount?: number;
  items?: BuyerOrderItem[];
  centralOrderReadModel?: CentralOrderReadModel;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const formatMoney = (amount: number | string, currency?: string) => {
  const resolvedCurrency = currency || 'CZK';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: resolvedCurrency,
    }).format(Number(amount || 0));
  } catch {
    return `${amount} ${resolvedCurrency}`;
  }
};

const lifecycleLabel = (model?: CentralOrderReadModel) => {
  const stage = model?.lifecycleStage || model?.status || "";
  const normalizedStage = stage.toLowerCase();
  return CENTRAL_LIFECYCLE_LABELS[normalizedStage] || model?.displayStatus || stage || "Ordered";
};

const statusClass = (state?: CentralOrderReadModel['state']) => {
  if (state === 'available') return 'bg-green-100 text-green-800';
  if (state === 'stale') return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-800';
};

const BuyerOrdersPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const loadOrders = useCallback(async (requestedPage = 1, options: { background?: boolean } = {}) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (options.background) setBackgroundRefreshing(true);
    else setLoading(true);
    try {
      const response = await api.get('/allegro/buyer/orders', {
        params: { page: requestedPage, limit: pagination.limit },
        timeout: 5000,
      });
      if (response.data.success) {
        const data = response.data.data || {};
        setOrders(data.items || []);
        setPagination(data.pagination || { page: requestedPage, limit: pagination.limit, total: 0, totalPages: 0 });
        setError(null);
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      if (!options.background) {
        if (err instanceof AxiosError && err.response?.status === 401) {
          setError('Please sign in again to view your orders.');
        } else {
          setError('Failed to load your orders. Please try again later.');
        }
      }
    } finally {
      refreshInFlight.current = false;
      if (options.background) setBackgroundRefreshing(false);
      else setLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    void loadOrders(page);
  }, [loadOrders, page]);

  useEffect(() => {
    const refreshVisibleOrders = () => {
      if (document.visibilityState === 'visible') {
        void loadOrders(page, { background: true });
      }
    };
    const interval = window.setInterval(refreshVisibleOrders, 30000);
    document.addEventListener('visibilitychange', refreshVisibleOrders);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisibleOrders);
    };
  }, [loadOrders, page]);

  const goToPage = (nextPage: number) => {
    const bounded = Math.min(Math.max(nextPage, 1), Math.max(pagination.totalPages || 1, 1));
    if (bounded !== page) setPage(bounded);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">Allegro.alfares</p>
            <h1 className="text-2xl font-semibold text-gray-900">My orders</h1>
            {user && <p className="text-sm text-gray-600">Signed in as {user.firstName || user.email}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => { void loadOrders(page); }} disabled={loading || backgroundRefreshing}>Refresh</Button>
            <Button variant="secondary" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              Page {pagination.page || page} of {Math.max(pagination.totalPages || 1, 1)} ({pagination.total} orders)
              {loading && <span className="ml-2">Loading...</span>}
              {backgroundRefreshing && <span className="ml-2">Refreshing central lifecycle...</span>}
              {!loading && !backgroundRefreshing && lastRefreshedAt && <span className="ml-2">Last refreshed {lastRefreshedAt.toLocaleTimeString()}</span>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => goToPage(page - 1)} disabled={loading || page <= 1} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50">Previous</button>
              <button type="button" onClick={() => goToPage(page + 1)} disabled={loading || page >= Math.max(pagination.totalPages || 1, 1)} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50">Next</button>
            </div>
          </div>

          {orders.length === 0 ? (
            <p className="text-sm text-gray-600">No subject-bound orders are available for this account.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const central = order.centralOrderReadModel;
                return (
                  <article key={order.id} className="rounded border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Order {order.allegroOrderId}</p>
                        <p className="text-sm text-gray-600">{order.orderedAt ? new Date(order.orderedAt).toLocaleString() : 'Date unavailable'}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-lg font-semibold text-gray-900">{formatMoney(order.totalPrice, order.currency)}</p>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(central?.state)}`}>{lifecycleLabel(central)}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-gray-700 sm:grid-cols-3">
                      <p>Payment: {central?.paymentStatus || order.paymentStatus || '-'}</p>
                      <p>Fulfillment: {central?.fulfillmentStatus || order.fulfillmentStatus || '-'}</p>
                      <p>Delivery: {central?.warehouseHandoffStatus || order.trackingStatus || order.deliveryMethod || '-'}</p>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2">
                        {order.items.map((item, index) => (
                          <div key={`${order.id}-${index}`} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-gray-700">{item.catalogProductId || 'Catalog item'}</span>
                            <span className="text-gray-900">{item.quantity} x {formatMoney(item.price, order.currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default BuyerOrdersPage;

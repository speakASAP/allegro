/**
 * Orders Page
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AxiosError } from 'axios';
import api from '../services/api';
import { Card } from '../components/Card';

interface CentralOrderReadModel {
  state: 'available' | 'unknown' | 'stale';
  id?: string | null;
  displayStatus?: string | null;
  lifecycleStage?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  warehouseHandoffStatus?: string | null;
  reason?: string | null;
  forwardingAttempt?: {
    id?: string;
    status?: string | null;
    attemptedAt?: string | null;
    completedAt?: string | null;
  } | null;
  source?: string | null;
}

interface Order {
  id: string;
  allegroOrderId: string;
  buyerEmail?: string;
  quantity: number;
  price: number | string;
  totalPrice: number | string;
  currency?: string;
  lineItemsCount?: number;
  marketplaceId?: string;
  status: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  orderDate: string;
  centralOrderReadModel?: CentralOrderReadModel;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface StatisticCount {
  value: string;
  count: number;
}

interface OrderStatistics {
  generatedAt: string;
  totals: {
    orders: number;
    centralForwardingAttempts: number;
    withTrackingNumber: number;
    missingTrackingNumber: number;
    withDeliveryMethod: number;
    missingDeliveryMethod: number;
  };
  statusCounts: StatisticCount[];
  paymentStatusCounts: StatisticCount[];
  centralForwarding: {
    statusCounts: StatisticCount[];
    forwarded: number;
    blocked: number;
    failed: number;
    disabled: number;
  };
  delivery: {
    fulfillmentStatusCounts: StatisticCount[];
    deliveryMethodCounts: StatisticCount[];
    tracking: {
      withTrackingNumber: number;
      missingTrackingNumber: number;
    };
    deliveryMethodCoverage: {
      withDeliveryMethod: number;
      missingDeliveryMethod: number;
    };
  };
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [statistics, setStatistics] = useState<OrderStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);
  const [loading, setLoading] = useState(false); // Start as false to render immediately
  const [error, setError] = useState<string | null>(null);
  const ordersRefreshInFlight = useRef(false);

  const loadOrderStatistics = useCallback(async (options: { background?: boolean } = {}) => {
    if (!options.background) {
      setStatisticsLoading(true);
    }
    try {
      const response = await api.get("/allegro/orders/statistics", { timeout: 5000 });
      if (response.data.success) {
        setStatistics(response.data.data || null);
      }
    } catch (err) {
      console.error("Failed to load order statistics", err);
    } finally {
      if (!options.background) {
        setStatisticsLoading(false);
      }
    }
  }, []);

  const loadOrders = useCallback(async (requestedPage = 1, options: { background?: boolean } = {}) => {
    if (ordersRefreshInFlight.current) {
      return;
    }
    ordersRefreshInFlight.current = true;
    if (!options.background) {
      setLoading(true);
    }
    try {
      // Use reasonable timeout for database queries (5 seconds maximum)
      const response = await api.get("/allegro/orders", {
        params: {
          page: requestedPage,
          limit: pagination.limit,
        },
        timeout: 5000, // 5 seconds maximum
      });
      if (response.data.success) {
        const data = response.data.data || {};
        setOrders(data.items || []); // Set orders from response data
        setPagination(data.pagination || {
          page: requestedPage,
          limit: pagination.limit,
          total: data.items?.length || 0,
          totalPages: 1,
        });
        setError(null); // Clear any previous errors
      }
    } catch (err) {
      console.error("Failed to load orders", err);
      if (!options.background) {
        if (err instanceof AxiosError) {
          const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
          if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
            setError(axiosError.serviceErrorMessage);
          } else {
            setError("Failed to load orders. Please try again later.");
          }
        } else {
          setError("Failed to load orders. Please try again later.");
        }
      }
    } finally {
      ordersRefreshInFlight.current = false;
      if (!options.background) {
        setLoading(false);
      }
    }
  }, [pagination.limit]);

  useEffect(() => {
    // Load orders in background (non-blocking)
    void loadOrders(page);
  }, [loadOrders, page]);

  useEffect(() => {
    void loadOrderStatistics();
  }, [loadOrderStatistics]);

  useEffect(() => {
    const refreshVisibleOrders = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadOrders(page, { background: true });
      void loadOrderStatistics({ background: true });
    };

    const interval = window.setInterval(refreshVisibleOrders, 30000);
    document.addEventListener("visibilitychange", refreshVisibleOrders);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisibleOrders);
    };
  }, [loadOrderStatistics, loadOrders, page]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY_FOR_PROCESSING':
      case 'PAID':
        return 'text-green-600 bg-green-100';
      case 'SENT':
      case 'PICKED_UP':
        return 'text-blue-600 bg-blue-100';
      case 'DELIVERED':
      case 'RETURNED':
        return 'text-purple-600 bg-purple-100';
      case 'CANCELLED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getCentralStatusColor = (state?: CentralOrderReadModel['state']) => {
    switch (state) {
      case 'available':
        return 'text-green-700 bg-green-100';
      case 'stale':
        return 'text-amber-700 bg-amber-100';
      case 'unknown':
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

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

  const formatShortId = (value?: string | null) => {
    if (!value) {
      return '-';
    }
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  };

  const centralLifecycleLabel = (model?: CentralOrderReadModel) => {
    const label = model?.displayStatus || model?.lifecycleStage || model?.status;
    return label || "Unavailable";
  };

  const formatStatisticList = (items?: StatisticCount[], limit = 3) => {
    if (!items || items.length === 0) {
      return "-";
    }
    return items.slice(0, limit).map((item) => `${item.value}: ${item.count}`).join(" / ");
  };

  const goToPage = (nextPage: number) => {
    const boundedPage = Math.min(Math.max(nextPage, 1), Math.max(pagination.totalPages || 1, 1));
    if (boundedPage !== page) {
      setPage(boundedPage);
    }
  };

  // Page renders immediately, no blocking loading screen
  // Loading state is used for showing loading indicators in the UI, not blocking render

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Orders{loading && <span className="ml-2 text-sm text-gray-500">(Loading...)</span>}</h2>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded whitespace-pre-line">
          <div className="font-semibold mb-2">Error:</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Order total">
          <p className="text-3xl font-semibold text-gray-900">{statistics?.totals.orders ?? (statisticsLoading ? "..." : 0)}</p>
          <p className="mt-2 text-sm text-gray-600">{formatStatisticList(statistics?.statusCounts)}</p>
        </Card>
        <Card title="Central lifecycle">
          <p className="text-3xl font-semibold text-gray-900">{statistics?.centralForwarding.forwarded ?? (statisticsLoading ? "..." : 0)}</p>
          <p className="mt-2 text-sm text-gray-600">Forwarded / blocked {statistics?.centralForwarding.blocked ?? 0} / failed {statistics?.centralForwarding.failed ?? 0}</p>
        </Card>
        <Card title="Delivery tracking">
          <p className="text-3xl font-semibold text-gray-900">{statistics?.delivery.tracking.withTrackingNumber ?? (statisticsLoading ? "..." : 0)}</p>
          <p className="mt-2 text-sm text-gray-600">Missing tracking {statistics?.delivery.tracking.missingTrackingNumber ?? 0}</p>
        </Card>
        <Card title="Fulfillment">
          <p className="text-sm font-medium text-gray-900">{formatStatisticList(statistics?.delivery.fulfillmentStatusCounts)}</p>
          <p className="mt-2 text-sm text-gray-600">Delivery methods {statistics?.delivery.deliveryMethodCoverage.withDeliveryMethod ?? 0}</p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-600">
            Showing page {pagination.page || page} of {Math.max(pagination.totalPages || 1, 1)} ({pagination.total} orders)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={loading || page <= 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={loading || page >= Math.max(pagination.totalPages || 1, 1)}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="text-gray-600">No orders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Market</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lines</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Central Order</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Central Lifecycle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allegro Snapshot</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => {
                  const centralReadModel = order.centralOrderReadModel;
                  return (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.allegroOrderId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.buyerEmail || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.marketplaceId || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.lineItemsCount ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.quantity}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatMoney(order.totalPrice, order.currency)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" title={centralReadModel?.id || undefined}>
                        {formatShortId(centralReadModel?.id)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex max-w-xs flex-col gap-1">
                          <span
                            className={`inline-flex w-fit px-2 py-1 text-xs font-semibold rounded-full ${getCentralStatusColor(centralReadModel?.state)}`}
                            title={centralReadModel?.reason || undefined}
                          >
                            {centralLifecycleLabel(centralReadModel)}
                          </span>
                          {centralReadModel?.warehouseHandoffStatus && (
                            <span className="text-xs text-gray-600">Warehouse: {centralReadModel.warehouseHandoffStatus}</span>
                          )}
                          {centralReadModel?.paymentStatus && (
                            <span className="text-xs text-gray-600">Payment: {centralReadModel.paymentStatus}</span>
                          )}
                          {centralReadModel?.reason && (
                            <span className="whitespace-normal text-xs text-gray-500">{centralReadModel.reason}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                            Order: {order.status}
                          </span>
                          <span className={`inline-flex w-fit px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.paymentStatus || '')}`}>
                            Payment: {order.paymentStatus || '-'}
                          </span>
                          <span className={`inline-flex w-fit px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.fulfillmentStatus || '')}`}>
                            Fulfillment: {order.fulfillmentStatus || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.orderDate).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default OrdersPage;

/**
 * Orders Page
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import api from '../services/api';
import { Card } from '../components/Card';

interface Order {
  id: string;
  allegroOrderId: string;
  buyerEmail?: string;
  quantity: number;
  price: number;
  totalPrice: number;
  status: string;
  orderDate: string;
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false); // Start as false to render immediately
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load orders in background (non-blocking)
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true); // Set loading only during the API call
    try {
      // Use shorter timeout for fast database queries (5 seconds is more than enough)
      // Database queries should complete in <100ms, so 5s gives plenty of buffer
      const response = await api.get('/allegro/orders', {
        timeout: 5000, // 5 seconds for database queries (should complete in <100ms)
      });
      if (response.data.success) {
        setOrders(response.data.data.items || []);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to load orders', err);
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError('Failed to load orders. Please try again later.');
        }
      } else {
        setError('Failed to load orders. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'text-green-600 bg-green-100';
      case 'SENT':
        return 'text-blue-600 bg-blue-100';
      case 'DELIVERED':
        return 'text-purple-600 bg-purple-100';
      case 'CANCELLED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
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

      <Card>
        {orders.length === 0 ? (
          <p className="text-gray-600">No orders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.allegroOrderId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.buyerEmail || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.quantity}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.totalPrice} PLN</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.orderDate).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default OrdersPage;


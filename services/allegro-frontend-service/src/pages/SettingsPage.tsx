/**
 * Settings Page
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import api from '../services/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card } from '../components/Card';

interface SupplierConfig {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKey?: string;
  apiConfig?: Record<string, unknown>;
}

interface Settings {
  id: string;
  userId: string;
  allegroClientId?: string;
  allegroClientSecret?: string;
  supplierConfigs?: SupplierConfig[];
  preferences?: Record<string, unknown>;
}

const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [allegroClientId, setAllegroClientId] = useState('');
  const [allegroClientSecret, setAllegroClientSecret] = useState('');

  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierEndpoint, setNewSupplierEndpoint] = useState('');
  const [newSupplierKey, setNewSupplierKey] = useState('');
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        setSettings(data);
        setAllegroClientId(data.allegroClientId || '');
        setAllegroClientSecret(data.allegroClientSecret || '');
      }
    } catch (err: unknown) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAllegro = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put('/settings', {
        allegroClientId,
        allegroClientSecret,
      });

      if (response.data.success) {
        setSuccess('Allegro settings saved successfully');
        loadSettings();
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Failed to save settings';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleValidateAllegro = async () => {
    if (!allegroClientId || !allegroClientSecret) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/settings/validate/allegro', {
        clientId: allegroClientId,
        clientSecret: allegroClientSecret,
      });

      if (response.data.success && response.data.data.valid) {
        setSuccess('Allegro API keys are valid!');
      } else {
        setError(response.data.data.message || 'Invalid API keys');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Failed to validate API keys';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplierName || !newSupplierEndpoint || !newSupplierKey) {
      setError('Please fill all supplier fields');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/settings/suppliers', {
        name: newSupplierName,
        apiEndpoint: newSupplierEndpoint,
        apiKey: newSupplierKey,
      });

      if (response.data.success) {
        setSuccess('Supplier added successfully');
        setNewSupplierName('');
        setNewSupplierEndpoint('');
        setNewSupplierKey('');
        setShowAddSupplier(false);
        loadSettings();
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Failed to add supplier';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSupplier = async (supplierId: string) => {
    if (!confirm('Are you sure you want to remove this supplier?')) {
      return;
    }

    try {
      await api.delete(`/settings/suppliers/${supplierId}`);
      setSuccess('Supplier removed successfully');
      loadSettings();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof AxiosError && err.response?.data?.error?.message
          ? err.response.data.error.message
          : 'Failed to remove supplier';
      setError(errorMessage);
    }
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {/* Allegro Settings */}
      <Card title="Allegro API Configuration">
        <div className="space-y-4">
          <Input
            label="Client ID"
            type="text"
            value={allegroClientId}
            onChange={(e) => setAllegroClientId(e.target.value)}
            placeholder="Enter your Allegro Client ID"
          />

          <Input
            label="Client Secret"
            type="password"
            value={allegroClientSecret}
            onChange={(e) => setAllegroClientSecret(e.target.value)}
            placeholder="Enter your Allegro Client Secret"
          />

          <div className="flex space-x-4">
            <Button onClick={handleSaveAllegro} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={handleValidateAllegro} disabled={saving}>
              Validate Keys
            </Button>
          </div>
        </div>
      </Card>

      {/* Supplier Configurations */}
      <Card title="Supplier Configurations">
        <div className="space-y-4">
          {settings?.supplierConfigs && settings.supplierConfigs.length > 0 ? (
            <div className="space-y-2">
              {settings.supplierConfigs.map((supplier: SupplierConfig) => (
                <div key={supplier.id} className="p-4 border rounded-lg flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold">{supplier.name}</h4>
                    <p className="text-sm text-gray-600">{supplier.apiEndpoint}</p>
                  </div>
                  <Button variant="danger" size="small" onClick={() => handleRemoveSupplier(supplier.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No suppliers configured yet.</p>
          )}

          {showAddSupplier ? (
            <div className="p-4 border rounded-lg space-y-4">
              <Input
                label="Supplier Name"
                type="text"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="e.g., Supplier ABC"
              />
              <Input
                label="API Endpoint"
                type="text"
                value={newSupplierEndpoint}
                onChange={(e) => setNewSupplierEndpoint(e.target.value)}
                placeholder="https://api.supplier.com"
              />
              <Input
                label="API Key"
                type="password"
                value={newSupplierKey}
                onChange={(e) => setNewSupplierKey(e.target.value)}
                placeholder="Enter API key"
              />
              <div className="flex space-x-4">
                <Button onClick={handleAddSupplier} disabled={saving}>
                  {saving ? 'Adding...' : 'Add Supplier'}
                </Button>
                <Button variant="secondary" onClick={() => setShowAddSupplier(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowAddSupplier(true)}>
              + Add Supplier
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;

/**
 * Settings Page
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import api, { oauthApi } from '../services/api';
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

  // OAuth state
  const [oauthStatus, setOauthStatus] = useState<{
    authorized: boolean;
    expiresAt?: string;
    scopes?: string;
  } | null>(null);
  const [loadingOAuth, setLoadingOAuth] = useState(false);

  useEffect(() => {
    loadSettings();
    loadOAuthStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        setSettings(data);
        setAllegroClientId(data.allegroClientId || '');
        // Display Client Secret if it exists (even if null from decryption failure)
        // The backend returns the decrypted value, or null if decryption failed
        // We should display the actual value if it exists
        setAllegroClientSecret(data.allegroClientSecret ?? '');
      }
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to load settings');
        }
      } else {
        setError('Failed to load settings');
      }
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

      if (response.data.success && response.data.data && response.data.data.valid === true) {
        setSuccess('Allegro API keys validated successfully');
        setError('');
      } else {
        const errorMsg = response.data?.data?.message || 'Invalid API keys';
        setError(errorMsg);
        setSuccess('');
      }
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        // Check if it's a connection error
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          // Check if the response has error data
          const errorMessage = err.response?.data?.error?.message 
            || err.response?.data?.data?.message
            || err.response?.data?.message
            || 'Failed to validate API keys';
          setError(errorMessage);
        }
      } else {
        setError('Failed to validate API keys');
      }
      setSuccess('');
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

  const loadOAuthStatus = async () => {
    try {
      const response = await oauthApi.getStatus();
      if (response.data.success) {
        setOauthStatus(response.data.data);
      }
    } catch (err) {
      // Silently fail - OAuth might not be configured
      console.error('Failed to load OAuth status', err);
    }
  };

  const handleAuthorizeAllegro = async () => {
    if (!allegroClientId) {
      setError('Please configure Allegro Client ID first');
      return;
    }

    setLoadingOAuth(true);
    setError('');
    setSuccess('');

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
    } finally {
      setLoadingOAuth(false);
    }
  };

  const handleRevokeAllegro = async () => {
    if (!confirm('Are you sure you want to revoke OAuth authorization? You will need to authorize again to access your offers.')) {
      return;
    }

    setLoadingOAuth(true);
    setError('');
    setSuccess('');

    try {
      await oauthApi.revoke();
      setSuccess('OAuth authorization revoked successfully');
      await loadOAuthStatus();
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const axiosError = err as AxiosError & { isConnectionError?: boolean; serviceErrorMessage?: string };
        if (axiosError.isConnectionError && axiosError.serviceErrorMessage) {
          setError(axiosError.serviceErrorMessage);
        } else {
          setError(err.response?.data?.error?.message || 'Failed to revoke OAuth authorization');
        }
      } else {
        setError('Failed to revoke OAuth authorization');
      }
    } finally {
      setLoadingOAuth(false);
    }
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

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

      {/* OAuth Authorization */}
      <Card title="Allegro OAuth Authorization">
        <div className="space-y-4">
          {oauthStatus === null ? (
            <p className="text-gray-600">Loading authorization status...</p>
          ) : oauthStatus.authorized ? (
            <div className="space-y-3">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-green-600 font-semibold">✓ Authorized</span>
                </div>
                {oauthStatus.expiresAt && (
                  <p className="text-sm text-gray-600 mt-2">
                    Token expires: {new Date(oauthStatus.expiresAt).toLocaleString()}
                  </p>
                )}
                {oauthStatus.scopes && (
                  <p className="text-sm text-gray-600 mt-1">
                    Scopes: {oauthStatus.scopes}
                  </p>
                )}
              </div>
              <Button variant="danger" onClick={handleRevokeAllegro} disabled={loadingOAuth}>
                {loadingOAuth ? 'Revoking...' : 'Revoke Authorization'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800">
                  <strong>Not Authorized</strong>
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  To import offers from Allegro, you need to authorize the application. This will redirect you to Allegro's authorization page.
                </p>
              </div>
              <Button onClick={handleAuthorizeAllegro} disabled={loadingOAuth || !allegroClientId}>
                {loadingOAuth ? 'Authorizing...' : 'Authorize with Allegro'}
              </Button>
              {!allegroClientId && (
                <p className="text-sm text-gray-600">
                  Please configure your Allegro Client ID first above.
                </p>
              )}
            </div>
          )}
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

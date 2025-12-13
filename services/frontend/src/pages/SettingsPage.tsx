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
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadOAuthStatus();

    // Check if returning from OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('oauth_refresh') === 'true') {
      loadOAuthStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        setSettings(data);
        setAllegroClientId(data.allegroClientId || '');
        
        // Debug logging
        console.log('[SettingsPage] loadSettings response:', {
          hasClientSecret: !!data.allegroClientSecret,
          clientSecretLength: data.allegroClientSecret?.length,
          hasDecryptionError: !!data._allegroClientSecretDecryptionError,
          decryptionError: data._allegroClientSecretDecryptionError,
        });
        
        // Check if Client Secret exists in database (regardless of decryption success)
        // If _allegroClientSecretDecryptionError exists, it means the secret exists but decryption failed
        const secretExistsInDb = data._allegroClientSecretDecryptionError || (data.allegroClientSecret && data.allegroClientSecret.length > 0);
        
        if (data._allegroClientSecretDecryptionError && data.allegroClientSecret === null) {
          // Secret exists in DB but decryption failed - show stars and error
          const errorInfo = data._allegroClientSecretDecryptionError;
          const errorMessage = errorInfo && typeof errorInfo === 'object'
            ? `Client Secret Decryption Error:\n\n` +
              `• Status: Client Secret exists in database but could not be decrypted\n` +
              `• Error Type: ${errorInfo.errorType || 'Unknown'}\n` +
              `• Error Details: ${errorInfo.error || 'Unknown error'}\n\n` +
              `• Solution: ${errorInfo.suggestion || 'Please re-enter your Client Secret and save it again.'}\n\n` +
              `This typically occurs when the encryption key has changed or the data was encrypted with a different configuration.`
            : 'Client Secret exists in database but could not be decrypted. Please re-enter your Client Secret and save it again.';
          setError(errorMessage);
          setAllegroClientSecret('********'); // Show stars because secret exists in DB
          console.log('[SettingsPage] Setting Client Secret to stars (decryption failed)');
        } else if (secretExistsInDb) {
          // Client Secret exists in database and was successfully decrypted - show masked value
          setAllegroClientSecret('********');
          console.log('[SettingsPage] Setting Client Secret to stars (exists and decrypted)');
        } else {
          // No Client Secret in database - show empty
          setAllegroClientSecret('');
          console.log('[SettingsPage] Setting Client Secret to empty (does not exist)');
        }
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
    console.log('[SettingsPage] handleSaveAllegro START', {
      allegroClientId: allegroClientId || 'EMPTY',
      allegroClientIdLength: allegroClientId?.length || 0,
      allegroClientSecret: allegroClientSecret ? (allegroClientSecret.substring(0, 10) + '...') : 'EMPTY',
      allegroClientSecretLength: allegroClientSecret?.length || 0,
      allegroClientSecretIsMasked: allegroClientSecret === '********',
      allegroClientSecretIsEmpty: !allegroClientSecret || allegroClientSecret.length === 0,
      allegroClientSecretType: typeof allegroClientSecret,
    });
    
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Only send Client Secret if it was actually changed (not masked value)
      const payload: any = {
        allegroClientId,
      };
      
      // Only include Client Secret if it's not the masked placeholder
      if (allegroClientSecret && allegroClientSecret !== '********') {
        payload.allegroClientSecret = allegroClientSecret;
        console.log('[SettingsPage] Including Client Secret in payload', {
          clientSecretLength: allegroClientSecret.length,
          clientSecretFirstChars: allegroClientSecret.substring(0, 5) + '...',
        });
      } else {
        console.log('[SettingsPage] NOT including Client Secret in payload', {
          reason: allegroClientSecret === '********' ? 'masked value' : 'empty',
          allegroClientSecret,
        });
      }
      
      console.log('[SettingsPage] Sending PUT /settings request', JSON.stringify({
        payloadKeys: Object.keys(payload),
        hasClientId: !!payload.allegroClientId,
        clientId: payload.allegroClientId || 'EMPTY',
        clientIdLength: payload.allegroClientId?.length || 0,
        hasClientSecret: !!payload.allegroClientSecret,
        clientSecretLength: payload.allegroClientSecret?.length || 0,
        clientSecretFirstChars: payload.allegroClientSecret ? (payload.allegroClientSecret.substring(0, 10) + '...') : 'EMPTY',
      }, null, 2));
      
      const response = await api.put('/settings', payload);
      
      console.log('[SettingsPage] Received PUT /settings response', JSON.stringify({
        success: response.data?.success,
        hasData: !!response.data?.data,
        responseKeys: response.data ? Object.keys(response.data) : [],
        dataKeys: response.data?.data ? Object.keys(response.data.data) : [],
        hasClientId: !!response.data?.data?.allegroClientId,
        clientId: response.data?.data?.allegroClientId || 'EMPTY',
        hasClientSecret: !!response.data?.data?.allegroClientSecret,
        clientSecretLength: response.data?.data?.allegroClientSecret?.length || 0,
        clientSecretFirstChars: response.data?.data?.allegroClientSecret ? (response.data?.data?.allegroClientSecret.substring(0, 10) + '...') : 'EMPTY',
        hasDecryptionError: !!response.data?.data?._allegroClientSecretDecryptionError,
        decryptionError: response.data?.data?._allegroClientSecretDecryptionError || 'NONE',
      }, null, 2));

      if (response.data.success) {
        setSuccess('Allegro settings saved successfully');
        loadSettings();
        // Reload OAuth status in case credentials changed
        loadOAuthStatus();
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
      } else {
        // If response is not successful, set as not authorized
        setOauthStatus({ authorized: false });
      }
    } catch (err: unknown) {
      // On error, set as not authorized (don't leave as null to avoid infinite loading)
      console.error('Failed to load OAuth status', err);
      setOauthStatus({ authorized: false });
    }
  };

  const handleAuthorizeOAuth = async () => {
    // Check if Client ID is configured (Client Secret might not be returned by API for security)
    const hasClientId = allegroClientId || settings?.allegroClientId;
    
    if (!hasClientId) {
      setError('Please configure and save your Allegro Client ID and Client Secret first');
      return;
    }

    setOauthLoading(true);
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
          // Backend will return specific error if credentials are missing
          setError(err.response?.data?.error?.message || 'Failed to start OAuth authorization');
        }
      } else {
        setError('Failed to start OAuth authorization');
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const handleRevokeOAuth = async () => {
    if (!confirm('Are you sure you want to revoke OAuth authorization? You will need to re-authorize to import offers.')) {
      return;
    }

    setOauthLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await oauthApi.revoke();
      if (response.data.success) {
        setSuccess('OAuth authorization revoked successfully');
        loadOAuthStatus();
      } else {
        setError('Failed to revoke OAuth authorization');
      }
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
      setOauthLoading(false);
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
      <Card title="OAuth Authorization">
        <div className="space-y-4">
          {oauthStatus === null ? (
            <p className="text-gray-600">Loading OAuth status...</p>
          ) : oauthStatus.authorized ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-green-700 font-semibold">Authorized</span>
              </div>
              {oauthStatus.expiresAt && (
                <div className="text-sm text-gray-600">
                  <strong>Expires:</strong> {new Date(oauthStatus.expiresAt).toLocaleString()}
                </div>
              )}
              {oauthStatus.scopes && (
                <div className="text-sm text-gray-600">
                  <strong>Scopes:</strong> {oauthStatus.scopes}
                </div>
              )}
              <div className="pt-2">
                <Button variant="danger" onClick={handleRevokeOAuth} disabled={oauthLoading}>
                  {oauthLoading ? 'Revoking...' : 'Revoke Authorization'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-red-700 font-semibold">Not Authorized</span>
              </div>
              <p className="text-sm text-gray-600">
                OAuth authorization is required to import offers from Allegro. Click the button below to authorize the application.
              </p>
              <div className="pt-2">
                <Button 
                  onClick={handleAuthorizeOAuth} 
                  disabled={oauthLoading || !(allegroClientId || settings?.allegroClientId)}
                >
                  {oauthLoading ? 'Starting Authorization...' : 'Authorize with Allegro'}
                </Button>
              </div>
              {!(allegroClientId || settings?.allegroClientId) && (
                <p className="text-sm text-yellow-600">
                  Please configure and save your Allegro Client ID and Client Secret first.
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

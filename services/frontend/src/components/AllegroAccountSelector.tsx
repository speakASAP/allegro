/**
 * Allegro Account Selector Component
 * Displays dropdown to select active Allegro account
 */

import React, { useState, useEffect, useCallback } from 'react';
import { allegroAccountApi } from '../services/api';
import { AxiosError } from 'axios';

interface AllegroAccount {
  id: string;
  name: string;
  isActive: boolean;
  oauthStatus?: {
    authorized: boolean;
    expiresAt?: string;
    scopes?: string;
  };
}

interface AllegroAccountSelectorProps {
  onAccountChange?: (accountId: string | null) => void;
}

export const AllegroAccountSelector: React.FC<AllegroAccountSelectorProps> = ({ onAccountChange }) => {
  const [accounts, setAccounts] = useState<AllegroAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await allegroAccountApi.getAccounts();
      console.log('[AllegroAccountSelector] API response:', {
        success: response.data?.success,
        hasData: !!response.data?.data,
        dataType: Array.isArray(response.data?.data) ? 'array' : typeof response.data?.data,
        dataLength: Array.isArray(response.data?.data) ? response.data.data.length : 'N/A',
        fullResponse: response.data,
      });
      
      if (response.data?.success) {
        const accountsData = response.data.data || [];
        console.log('[AllegroAccountSelector] Setting accounts:', accountsData);
        setAccounts(accountsData);
        
        // Find active account
        const activeAccount = accountsData.find((acc: AllegroAccount) => acc.isActive);
        const activeId = activeAccount?.id || null;
        setActiveAccountId(activeId);
        
        if (onAccountChange) {
          onAccountChange(activeId);
        }
      } else {
        console.warn('[AllegroAccountSelector] Response success is false:', response.data);
        setError('Failed to load accounts: Invalid response format');
      }
    } catch (err) {
      console.error('[AllegroAccountSelector] Error loading accounts:', err);
      // Truncate long error messages (like API Gateway connection errors)
      let errorMessage = 'Failed to load accounts';
      if (err instanceof AxiosError) {
        const fullMessage = err.response?.data?.error?.message || err.message || 'Failed to load accounts';
        // Truncate if message is too long (likely a connection error with instructions)
        if (fullMessage.length > 100) {
          errorMessage = fullMessage.split('\n')[0] + '...';
        } else {
          errorMessage = fullMessage;
        }
      }
      setError(errorMessage);
      // Don't clear accounts on error - show existing accounts if available
      // This allows graceful degradation
    } finally {
      setLoading(false);
    }
  }, [onAccountChange]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleAccountChange = async (accountId: string) => {
    if (accountId === activeAccountId) {
      return; // Already active
    }

    try {
      // Handle "No Active Account" (empty string)
      if (accountId === '') {
        await allegroAccountApi.deactivateAllAccounts();
        setActiveAccountId(null);
      } else {
        await allegroAccountApi.setActiveAccount(accountId);
        setActiveAccountId(accountId);
      }
      
      // Reload accounts to update active status
      await loadAccounts();
      
      if (onAccountChange) {
        onAccountChange(accountId === '' ? null : accountId);
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error?.message || 'Failed to set active account');
      } else {
        setError('Failed to set active account');
      }
    }
  };

  const activeAccount = accounts.find(acc => acc.id === activeAccountId);

  // Show loading state
  if (loading && accounts.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        Loading accounts...
      </div>
    );
  }

  // Show dropdown even if there's an error (graceful degradation)
  // Display error as a warning tooltip or small text, but don't block the UI
  return (
    <div className="flex items-center space-x-2">
      <label htmlFor="account-selector" className="text-sm font-medium text-gray-700">
        Allegro Account:
      </label>
      <div className="flex flex-col">
        <select
          id="account-selector"
          value={activeAccountId || ''}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- No Active Account --</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.oauthStatus?.authorized ? ' ✓' : ' (Not Authorized)'}
            </option>
          ))}
        </select>
        {error && (
          <span className="text-xs text-red-500 mt-1" title={error}>
            {error.length > 50 ? error.substring(0, 50) + '...' : error}
          </span>
        )}
      </div>
      {activeAccount && (
        <span className="text-xs text-gray-500">
          {activeAccount.oauthStatus?.authorized ? '✓ Authorized' : '⚠ Not Authorized'}
        </span>
      )}
    </div>
  );
};


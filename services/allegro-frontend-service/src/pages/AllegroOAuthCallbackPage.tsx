/**
 * Allegro OAuth Callback Page
 * Handles OAuth callback from Allegro
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

const AllegroOAuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' 
        ? 'Authorization was denied. Please try again and grant the required permissions.'
        : `Authorization failed: ${error}`);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization code or state. Please try again.');
      return;
    }

    // The backend callback endpoint handles the token exchange
    // We just need to show a success message and redirect
    // The actual callback is handled server-side via redirect
    setStatus('success');
    setMessage('Authorization successful! Redirecting to settings...');

    // Redirect to settings after 3 seconds
    const timer = setTimeout(() => {
      navigate('/dashboard/settings');
    }, 3000);

    return () => clearTimeout(timer);
  }, [searchParams, navigate]);

  const handleGoToSettings = () => {
    navigate('/dashboard/settings');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card title="Allegro OAuth Authorization">
        <div className="space-y-4">
          {status === 'loading' && (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Processing authorization...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="text-green-600 text-5xl mb-4">✓</div>
              <p className="text-gray-700 mb-4">{message}</p>
              <Button onClick={handleGoToSettings}>Go to Settings</Button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="text-red-600 text-5xl mb-4">✗</div>
              <p className="text-red-700 mb-4">{message}</p>
              <Button onClick={handleGoToSettings}>Go to Settings</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AllegroOAuthCallbackPage;


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
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    // Handle error case
    if (error) {
      setStatus('error');
      setMessage(error === 'access_denied' 
        ? 'Authorization was denied. Please try again and grant the required permissions.'
        : `Authorization failed: ${error}`);
      return;
    }

    // Handle success case (backend redirects with success=true after processing)
    if (success === 'true') {
      setStatus('success');
      setMessage('Authorization successful! Redirecting to settings...');

      // Redirect to settings after 2 seconds with refresh parameter
      const timer = setTimeout(() => {
        navigate('/dashboard/settings?oauth_refresh=true');
      }, 2000);

      return () => clearTimeout(timer);
    }

    // Handle direct callback from Allegro (with code and state)
    // This should be handled by the backend, but if it reaches here, show loading
    if (code && state) {
      setStatus('loading');
      setMessage('Processing authorization...');
      // The backend will redirect with success=true, so we'll handle it in the next render
      return;
    }

    // No valid parameters
    setStatus('error');
    setMessage('Invalid callback parameters. Please try again.');
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


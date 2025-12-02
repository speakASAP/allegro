/**
 * Landing Page
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-4">Allegro Integration System</h1>
          <p className="text-xl mb-8">Automate your Allegro marketplace operations with ease</p>
          <div className="space-x-4">
            <Link to="/register">
              <Button variant="secondary" size="large">Get Started</Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="large">Sign In</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🔄</div>
              <h3 className="text-xl font-semibold mb-2">Bidirectional Sync</h3>
              <p className="text-gray-600">Keep your products synchronized between your database and Allegro automatically</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-xl font-semibold mb-2">Product Import</h3>
              <p className="text-gray-600">Import products from CSV files and transform them to Allegro format</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Order Management</h3>
              <p className="text-gray-600">Handle orders from Allegro with webhook integration and real-time updates</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🔌</div>
              <h3 className="text-xl font-semibold mb-2">Multi-Supplier Support</h3>
              <p className="text-gray-600">Connect multiple suppliers and manage all your API keys in one place</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold mb-2">Real-time Updates</h3>
              <p className="text-gray-600">Get instant notifications about orders, stock changes, and sync status</p>
            </div>
            <div className="text-center p-6">
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-xl font-semibold mb-2">Secure & Reliable</h3>
              <p className="text-gray-600">Your API keys are encrypted and stored securely</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h3 className="text-2xl font-bold mb-4">Starter</h3>
              <div className="text-4xl font-bold mb-4">Free</div>
              <ul className="space-y-2 mb-6">
                <li>✓ Up to 100 products</li>
                <li>✓ Basic sync (every 30 minutes)</li>
                <li>✓ Single supplier</li>
                <li>✓ Email support</li>
              </ul>
              <Link to="/register">
                <Button className="w-full">Get Started</Button>
              </Link>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-blue-600">
              <div className="bg-blue-600 text-white text-sm font-semibold px-3 py-1 rounded-full inline-block mb-4">Popular</div>
              <h3 className="text-2xl font-bold mb-4">Professional</h3>
              <div className="text-4xl font-bold mb-4">$29<span className="text-lg">/month</span></div>
              <ul className="space-y-2 mb-6">
                <li>✓ Unlimited products</li>
                <li>✓ Fast sync (every 15 minutes)</li>
                <li>✓ Multiple suppliers</li>
                <li>✓ Priority support</li>
                <li>✓ Advanced analytics</li>
              </ul>
              <Link to="/register">
                <Button className="w-full">Get Started</Button>
              </Link>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h3 className="text-2xl font-bold mb-4">Enterprise</h3>
              <div className="text-4xl font-bold mb-4">Custom</div>
              <ul className="space-y-2 mb-6">
                <li>✓ Everything in Professional</li>
                <li>✓ Real-time sync</li>
                <li>✓ Custom integrations</li>
                <li>✓ Dedicated support</li>
                <li>✓ SLA guarantee</li>
              </ul>
              <Link to="/register">
                <Button className="w-full">Contact Sales</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-xl mb-8">Join thousands of sellers using our platform</p>
          <Link to="/register">
            <Button variant="secondary" size="large">Create Your Account</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2024 Allegro Integration System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;


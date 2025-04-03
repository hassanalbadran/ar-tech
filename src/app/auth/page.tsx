'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthForm from '@/components/ui/AuthForm';
import { FaUser } from 'react-icons/fa';

export default function AuthPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState({
    name: 'مستخدم الموقع',
    email: 'user@example.com'
  });

  // This would be connected to a real authentication system in a production app
  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto max-w-md">
        {isLoggedIn ? (
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center">
                <FaUser className="h-8 w-8 text-teal-600" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-center mb-6">مرحباً، {user.name}</h2>
            
            <div className="space-y-4 mb-8">
              <div className="p-4 bg-gray-50 rounded-md text-right">
                <p className="text-sm text-gray-500">البريد الإلكتروني</p>
                <p className="font-medium">{user.email}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <Link 
                href="/cart" 
                className="block w-full bg-teal-600 hover:bg-teal-700 text-white text-center font-bold py-3 rounded-md transition-colors"
              >
                عرض سلة التسوق
              </Link>
              
              <button
                onClick={handleLogout}
                className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-800 text-center font-bold py-3 rounded-md transition-colors"
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        ) : (
          <AuthForm />
        )}
      </div>
    </div>
  );
}

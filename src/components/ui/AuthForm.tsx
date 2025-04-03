'use client';

import { useState } from 'react';
import { FaUser, FaLock, FaEnvelope } from 'react-icons/fa';

const AuthForm = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here would be authentication logic
    console.log('Form submitted:', formData);
  };

  const handleGuestAccess = () => {
    // Logic for guest access
    console.log('Continuing as guest');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full mx-auto" dir="rtl">
      <h2 className="text-2xl font-bold text-center mb-6">
        {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div className="relative">
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              <FaUser />
            </div>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="الاسم الكامل"
              className="w-full border border-gray-300 rounded-md py-3 pr-10 pl-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required={!isLogin}
            />
          </div>
        )}
        
        <div className="relative">
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <FaEnvelope />
          </div>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="البريد الإلكتروني"
            className="w-full border border-gray-300 rounded-md py-3 pr-10 pl-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            required
          />
        </div>
        
        <div className="relative">
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
            <FaLock />
          </div>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="كلمة المرور"
            className="w-full border border-gray-300 rounded-md py-3 pr-10 pl-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            required
          />
        </div>
        
        <button
          type="submit"
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-md transition-colors"
        >
          {isLogin ? 'تسجيل الدخول' : 'إنشاء حساب'}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-teal-600 hover:text-teal-800 transition-colors"
        >
          {isLogin ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب بالفعل؟ تسجيل الدخول'}
        </button>
      </div>
      
      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">أو</span>
          </div>
        </div>
        
        <button
          onClick={handleGuestAccess}
          className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-md transition-colors"
        >
          متابعة كضيف
        </button>
      </div>
    </div>
  );
};

export default AuthForm;

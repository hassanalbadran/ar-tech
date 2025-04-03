'use client';

import { useState } from 'react';
import { FaCreditCard, FaMoneyBill } from 'react-icons/fa';

interface CheckoutFormProps {
  total: number;
  onComplete: () => void;
}

const CheckoutForm = ({ total, onComplete }: CheckoutFormProps) => {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [formData, setFormData] = useState({
    fullName: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here would be payment processing logic
    console.log('Checkout form submitted:', formData);
    onComplete();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6" dir="rtl">
      <h2 className="text-2xl font-bold mb-6 text-right">إتمام الطلب</h2>
      
      <div className="mb-6">
        <h3 className="font-semibold mb-2 text-right">ملخص الطلب</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">{total} د.ع</span>
            <span>إجمالي المنتجات:</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="font-semibold">5000 د.ع</span>
            <span>رسوم التوصيل:</span>
          </div>
          <div className="border-t border-gray-300 my-2 pt-2">
            <div className="flex justify-between text-lg font-bold">
              <span>{total + 5000} د.ع</span>
              <span>الإجمالي:</span>
            </div>
          </div>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-700 mb-1 text-right">الاسم الكامل</label>
          <input
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            required
          />
        </div>
        
        <div>
          <label className="block text-gray-700 mb-1 text-right">العنوان</label>
          <textarea
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            rows={3}
            required
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 mb-1 text-right">المدينة</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1 text-right">رقم الهاتف</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>
        </div>
        
        <div>
          <label className="block text-gray-700 mb-1 text-right">البريد الإلكتروني</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            required
          />
        </div>
        
        <div className="mt-6">
          <h3 className="font-semibold mb-3 text-right">طريقة الدفع</h3>
          <div className="flex flex-col space-y-3">
            <label className="flex items-center justify-end space-x-3 space-x-reverse cursor-pointer">
              <input
                type="radio"
                checked={paymentMethod === 'card'}
                onChange={() => setPaymentMethod('card')}
                className="form-radio text-teal-600"
              />
              <span className="mr-2">بطاقة ائتمان</span>
              <FaCreditCard className="text-gray-600" />
            </label>
            
            <label className="flex items-center justify-end space-x-3 space-x-reverse cursor-pointer">
              <input
                type="radio"
                checked={paymentMethod === 'cash'}
                onChange={() => setPaymentMethod('cash')}
                className="form-radio text-teal-600"
              />
              <span className="mr-2">الدفع عند الاستلام</span>
              <FaMoneyBill className="text-gray-600" />
            </label>
          </div>
        </div>
        
        {paymentMethod === 'card' && (
          <div className="space-y-4 mt-4 p-4 border border-gray-200 rounded-md">
            <div>
              <label className="block text-gray-700 mb-1 text-right">رقم البطاقة</label>
              <input
                type="text"
                name="cardNumber"
                value={formData.cardNumber}
                onChange={handleChange}
                placeholder="0000 0000 0000 0000"
                className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required={paymentMethod === 'card'}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 mb-1 text-right">تاريخ الانتهاء</label>
                <input
                  type="text"
                  name="cardExpiry"
                  value={formData.cardExpiry}
                  onChange={handleChange}
                  placeholder="MM/YY"
                  className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required={paymentMethod === 'card'}
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1 text-right">رمز الأمان</label>
                <input
                  type="text"
                  name="cardCvv"
                  value={formData.cardCvv}
                  onChange={handleChange}
                  placeholder="CVV"
                  className="w-full border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required={paymentMethod === 'card'}
                />
              </div>
            </div>
          </div>
        )}
        
        <button
          type="submit"
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-md transition-colors mt-6"
        >
          إتمام الطلب
        </button>
      </form>
    </div>
  );
};

export default CheckoutForm;

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import CartItem from '@/components/ui/CartItem';
import CheckoutForm from '@/components/ui/CheckoutForm';
import { FaArrowRight, FaShoppingBag } from 'react-icons/fa';

// Sample cart data
const initialCartItems = [
  {
    id: '1',
    title: 'سكراب طبي أزرق للرجال',
    price: 25000,
    image: '/images/products/product1.jpg',
    quantity: 1,
    size: 'L',
    color: '#3b82f6'
  },
  {
    id: '4',
    title: 'معطف طبي أبيض للنساء',
    price: 32000,
    image: '/images/products/product4.jpg',
    quantity: 2,
    size: 'M',
    color: '#ffffff'
  }
];

export default function CartPage() {
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [isCheckout, setIsCheckout] = useState(false);
  const [isOrderComplete, setIsOrderComplete] = useState(false);

  useEffect(() => {
    // In a real app, this would fetch cart items from localStorage or an API
    setCartItems(initialCartItems);
  }, []);

  const handleRemoveItem = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    setCartItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const calculateSubtotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handleCheckoutComplete = () => {
    setIsOrderComplete(true);
    setCartItems([]);
  };

  if (isOrderComplete) {
    return (
      <div className="min-h-screen py-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-4">تم تأكيد طلبك بنجاح!</h2>
            <p className="text-gray-600 mb-8">سيتم إرسال تفاصيل الطلب إلى بريدك الإلكتروني. شكراً لتسوقك معنا.</p>
            <Link href="/" className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-md transition-colors">
              العودة إلى الصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-right">سلة التسوق</h1>
        
        {cartItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FaShoppingBag className="h-10 w-10 text-gray-400" />
            </div>
            <h2 className="text-xl font-semibold mb-4">سلة التسوق فارغة</h2>
            <p className="text-gray-600 mb-8">لم تقم بإضافة أي منتجات إلى سلة التسوق بعد.</p>
            <Link href="/" className="inline-block bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-md transition-colors">
              تصفح المنتجات
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-6" dir="rtl">
                <h2 className="text-xl font-semibold mb-6 text-right">المنتجات</h2>
                
                <div className="space-y-4">
                  {cartItems.map(item => (
                    <CartItem
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      price={item.price}
                      image={item.image}
                      quantity={item.quantity}
                      size={item.size}
                      color={item.color}
                      onRemove={handleRemoveItem}
                      onUpdateQuantity={handleUpdateQuantity}
                    />
                  ))}
                </div>
                
                <div className="mt-8 flex justify-between items-center">
                  <Link href="/" className="flex items-center text-teal-600 hover:text-teal-800 transition-colors">
                    <FaArrowRight className="ml-2" />
                    <span>متابعة التسوق</span>
                  </Link>
                  
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      المجموع: <span className="text-teal-700">{calculateSubtotal()} د.ع</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-1">
              {isCheckout ? (
                <CheckoutForm 
                  total={calculateSubtotal()} 
                  onComplete={handleCheckoutComplete} 
                />
              ) : (
                <div className="bg-white rounded-lg shadow-md p-6" dir="rtl">
                  <h2 className="text-xl font-semibold mb-6 text-right">ملخص الطلب</h2>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="font-semibold">{calculateSubtotal()} د.ع</span>
                      <span>إجمالي المنتجات:</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">5000 د.ع</span>
                      <span>رسوم التوصيل:</span>
                    </div>
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <div className="flex justify-between text-lg font-bold">
                        <span>{calculateSubtotal() + 5000} د.ع</span>
                        <span>الإجمالي:</span>
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setIsCheckout(true)}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-md transition-colors mt-6"
                  >
                    متابعة الدفع
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

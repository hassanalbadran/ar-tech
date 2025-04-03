'use client';

import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    title: string;
    price: number;
    image: string;
    description: string;
    sizes: string[];
    colors: string[];
  };
  onAddToCart: () => void;
}

const ProductModal = ({ isOpen, onClose, product, onAddToCart }: ProductModalProps) => {
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" dir="rtl">
        <button 
          onClick={onClose}
          className="absolute top-4 left-4 text-gray-500 hover:text-gray-700 z-10"
        >
          <FaTimes size={24} />
        </button>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          <div className="relative h-80 md:h-full rounded-lg overflow-hidden">
            <img 
              src={product.image} 
              alt={product.title} 
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-3">{product.title}</h2>
            <p className="text-xl font-bold text-teal-700 mb-4">{product.price} د.ع</p>
            
            <div className="mb-6">
              <p className="text-gray-700">{product.description}</p>
            </div>
            
            <div className="mb-4">
              <h3 className="font-semibold mb-2">المقاس:</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`px-3 py-1 border rounded-md ${
                      selectedSize === size 
                        ? 'bg-teal-600 text-white border-teal-600' 
                        : 'border-gray-300 hover:border-teal-600'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="mb-4">
              <h3 className="font-semibold mb-2">اللون:</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                {product.colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      selectedColor === color ? 'border-black' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">الكمية:</h3>
              <div className="flex items-center justify-end">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 border border-gray-300 rounded-md flex items-center justify-center"
                >
                  -
                </button>
                <span className="w-12 text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 border border-gray-300 rounded-md flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
            
            <button 
              onClick={onAddToCart}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-md transition-colors"
            >
              إضافة إلى السلة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;

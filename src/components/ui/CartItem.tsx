'use client';

import { useState } from 'react';
import Image from 'next/image';
import { FaTrash, FaMinus, FaPlus } from 'react-icons/fa';

interface CartItemProps {
  id: string;
  title: string;
  price: number;
  image: string;
  quantity: number;
  size: string;
  color: string;
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, newQuantity: number) => void;
}

const CartItem = ({ 
  id, 
  title, 
  price, 
  image, 
  quantity, 
  size, 
  color,
  onRemove,
  onUpdateQuantity
}: CartItemProps) => {
  return (
    <div className="flex flex-col md:flex-row items-center border-b border-gray-200 py-4 gap-4">
      <div className="relative h-24 w-24 rounded-md overflow-hidden">
        <Image
          src={image}
          alt={title}
          fill
          style={{ objectFit: 'cover' }}
        />
      </div>
      
      <div className="flex-1 text-right">
        <h3 className="font-semibold">{title}</h3>
        <div className="text-sm text-gray-600 mt-1">
          <span>المقاس: {size}</span>
          <span className="mx-2">|</span>
          <span>اللون: 
            <span 
              className="inline-block w-3 h-3 rounded-full ml-1 align-middle" 
              style={{ backgroundColor: color }}
            ></span>
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onUpdateQuantity(id, Math.max(1, quantity - 1))}
          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-md"
        >
          <FaMinus size={12} />
        </button>
        <span className="w-8 text-center">{quantity}</span>
        <button 
          onClick={() => onUpdateQuantity(id, quantity + 1)}
          className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-md"
        >
          <FaPlus size={12} />
        </button>
      </div>
      
      <div className="font-semibold text-teal-700 w-24 text-center">
        {price * quantity} د.ع
      </div>
      
      <button 
        onClick={() => onRemove(id)}
        className="text-red-500 hover:text-red-700"
      >
        <FaTrash />
      </button>
    </div>
  );
};

export default CartItem;

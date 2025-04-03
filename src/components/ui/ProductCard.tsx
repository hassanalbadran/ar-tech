'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaShoppingCart, FaHeart } from 'react-icons/fa';

interface ProductCardProps {
  id: string;
  title: string;
  price: number;
  image: string;
  category: string;
}

const ProductCard = ({ id, title, price, image, category }: ProductCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative h-64 w-full">
        <Image
          src={image}
          alt={title}
          fill
          style={{ objectFit: 'cover' }}
          className={`transition-transform duration-500 ${isHovered ? 'scale-110' : 'scale-100'}`}
        />
        <div className="absolute top-2 right-2 z-10">
          <button 
            onClick={(e) => {
              e.preventDefault();
              setIsFavorite(!isFavorite);
            }}
            className={`p-2 rounded-full ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/80 text-gray-700'}`}
          >
            <FaHeart />
          </button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white text-right">
          <span className="inline-block bg-teal-600 text-white text-sm px-3 py-1 rounded-full">
            {category}
          </span>
        </div>
      </div>
      
      <div className="p-4 text-right">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="flex justify-between items-center">
          <button className="bg-teal-600 hover:bg-teal-700 text-white p-2 rounded-full transition-colors">
            <FaShoppingCart />
          </button>
          <p className="text-lg font-bold text-teal-700">{price} د.ع</p>
        </div>
      </div>
      
      <Link href={`/product/${id}`} className="absolute inset-0 z-0">
        <span className="sr-only">عرض التفاصيل</span>
      </Link>
    </div>
  );
};

export default ProductCard;

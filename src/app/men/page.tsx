'use client';

import { useState } from 'react';
import ProductCard from '@/components/ui/ProductCard';
import ProductModal from '@/components/ui/ProductModal';

// Sample data for men's products
const menProducts = [
  {
    id: '1',
    title: 'سكراب طبي أزرق للرجال',
    price: 25000,
    image: '/images/products/product1.jpg',
    category: 'رجالي',
    description: 'سكراب طبي مريح ومتين مصنوع من قماش عالي الجودة، مناسب للاستخدام اليومي في المستشفيات والعيادات.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#3b82f6', '#1e3a8a', '#16a34a', '#000000']
  },
  {
    id: '3',
    title: 'معطف طبي أبيض للرجال',
    price: 35000,
    image: '/images/products/product3.jpg',
    category: 'رجالي',
    description: 'معطف طبي كلاسيكي أبيض للرجال، مثالي للأطباء والصيادلة، مصنوع من قماش متين مقاوم للبقع.',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: ['#ffffff', '#f8fafc']
  },
  {
    id: '5',
    title: 'طقم سكراب طبي أخضر للرجال',
    price: 45000,
    image: '/images/products/product5.jpg',
    category: 'رجالي',
    description: 'طقم سكراب طبي كامل للرجال يتضمن قميص وبنطلون، مصنوع من قماش مريح ومتين مناسب للاستخدام اليومي.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#16a34a', '#3b82f6', '#1e3a8a', '#000000']
  },
  {
    id: '7',
    title: 'سكراب طبي أسود للرجال',
    price: 28000,
    image: '/images/products/product1.jpg',
    category: 'رجالي',
    description: 'سكراب طبي بلون أسود أنيق للرجال، مصنوع من قماش عالي الجودة مريح ومتين.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#000000', '#1e3a8a', '#3b82f6', '#16a34a']
  },
  {
    id: '9',
    title: 'معطف طبي رمادي للرجال',
    price: 32000,
    image: '/images/products/product3.jpg',
    category: 'رجالي',
    description: 'معطف طبي بلون رمادي للرجال، مثالي للأطباء والصيادلة، مصنوع من قماش متين مقاوم للبقع.',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: ['#6b7280', '#ffffff', '#f8fafc']
  },
  {
    id: '11',
    title: 'طقم سكراب طبي أزرق داكن للرجال',
    price: 48000,
    image: '/images/products/product5.jpg',
    category: 'رجالي',
    description: 'طقم سكراب طبي كامل للرجال بلون أزرق داكن، يتضمن قميص وبنطلون، مصنوع من قماش مريح ومتين.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#1e3a8a', '#3b82f6', '#16a34a', '#000000']
  }
];

export default function MenPage() {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    priceRange: 'all',
    size: 'all'
  });

  const handleProductClick = (product: any) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleAddToCart = () => {
    // Logic to add product to cart would go here
    console.log('Added to cart:', selectedProduct);
    setIsModalOpen(false);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Filter products based on selected filters
  const filteredProducts = menProducts.filter(product => {
    // Filter by price range
    if (filters.priceRange === 'low' && product.price > 30000) return false;
    if (filters.priceRange === 'medium' && (product.price < 30000 || product.price > 40000)) return false;
    if (filters.priceRange === 'high' && product.price < 40000) return false;
    
    // Filter by size
    if (filters.size !== 'all' && !product.sizes.includes(filters.size)) return false;
    
    return true;
  });

  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-right">ملابس طبية للرجال</h1>
            <p className="text-gray-600 mb-4 text-right">مجموعة متنوعة من الملابس الطبية عالية الجودة للرجال</p>
          </div>
          
          <div className="w-full md:w-auto flex flex-col md:flex-row gap-4 mt-4 md:mt-0">
            <div className="relative">
              <select
                name="priceRange"
                value={filters.priceRange}
                onChange={handleFilterChange}
                className="appearance-none bg-white border border-gray-300 rounded-md py-2 pl-10 pr-4 text-right focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">جميع الأسعار</option>
                <option value="low">أقل من 30,000 د.ع</option>
                <option value="medium">30,000 - 40,000 د.ع</option>
                <option value="high">أكثر من 40,000 د.ع</option>
              </select>
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path>
                </svg>
              </div>
            </div>
            
            <div className="relative">
              <select
                name="size"
                value={filters.size}
                onChange={handleFilterChange}
                className="appearance-none bg-white border border-gray-300 rounded-md py-2 pl-10 pr-4 text-right focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="all">جميع المقاسات</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
              </select>
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600">لا توجد منتجات تطابق المعايير المحددة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProducts.map((product) => (
              <div key={product.id} onClick={() => handleProductClick(product)}>
                <ProductCard
                  id={product.id}
                  title={product.title}
                  price={product.price}
                  image={product.image}
                  category={product.category}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Product Modal */}
      {selectedProduct && (
        <ProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          product={selectedProduct}
          onAddToCart={handleAddToCart}
        />
      )}
    </div>
  );
}

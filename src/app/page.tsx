'use client';

import { useState } from 'react';
import ImageSlider from '@/components/ui/ImageSlider';
import ProductCard from '@/components/ui/ProductCard';
import ProductModal from '@/components/ui/ProductModal';

// Sample data for slider images
const sliderImages = [
  {
    src: '/images/slides/slide1.jpg',
    alt: 'ملابس طبية للرجال'
  },
  {
    src: '/images/slides/slide2.jpg',
    alt: 'ملابس طبية للنساء'
  },
  {
    src: '/images/slides/slide3.jpg',
    alt: 'مجموعة متنوعة من الملابس الطبية'
  }
];

// Sample data for featured products
const featuredProducts = [
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
    id: '2',
    title: 'سكراب طبي وردي للنساء',
    price: 28000,
    image: '/images/products/product2.jpg',
    category: 'نسائي',
    description: 'سكراب طبي أنيق ومريح للنساء، مصنوع من قماش ناعم يسمح بحرية الحركة أثناء العمل.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#ec4899', '#be185d', '#3b82f6', '#ffffff']
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
    id: '4',
    title: 'معطف طبي أبيض للنساء',
    price: 32000,
    image: '/images/products/product4.jpg',
    category: 'نسائي',
    description: 'معطف طبي أنيق للنساء بتصميم عصري، مناسب للطبيبات والصيدلانيات، مصنوع من قماش عالي الجودة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
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
    id: '6',
    title: 'طقم سكراب طبي أزرق فاتح للنساء',
    price: 48000,
    image: '/images/products/product6.jpg',
    category: 'نسائي',
    description: 'طقم سكراب طبي كامل للنساء بتصميم أنيق، مصنوع من قماش ناعم ومريح يسمح بحرية الحركة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#93c5fd', '#ec4899', '#be185d', '#ffffff']
  }
];

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleProductClick = (product: any) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleAddToCart = () => {
    // Logic to add product to cart would go here
    console.log('Added to cart:', selectedProduct);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section with Image Slider */}
      <section className="w-full">
        <ImageSlider images={sliderImages} />
      </section>

      {/* Featured Products Section */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-right">منتجاتنا المميزة</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {featuredProducts.map((product) => (
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
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-right">تسوق حسب الفئة</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="relative h-80 rounded-lg overflow-hidden group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-teal-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
              <img 
                src="/images/products/product1.jpg" 
                alt="ملابس طبية للرجال" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute bottom-0 right-0 left-0 p-6 z-20 text-right">
                <h3 className="text-2xl font-bold text-white mb-2">ملابس الرجال</h3>
                <p className="text-white/80 mb-4">مجموعة متنوعة من الملابس الطبية للرجال</p>
                <a href="/men" className="inline-block bg-white text-teal-700 font-bold py-2 px-6 rounded-full hover:bg-teal-50 transition-colors">
                  تسوق الآن
                </a>
              </div>
            </div>
            
            <div className="relative h-80 rounded-lg overflow-hidden group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-pink-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"></div>
              <img 
                src="/images/products/product2.jpg" 
                alt="ملابس طبية للنساء" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute bottom-0 right-0 left-0 p-6 z-20 text-right">
                <h3 className="text-2xl font-bold text-white mb-2">ملابس النساء</h3>
                <p className="text-white/80 mb-4">مجموعة متنوعة من الملابس الطبية للنساء</p>
                <a href="/women" className="inline-block bg-white text-pink-700 font-bold py-2 px-6 rounded-full hover:bg-pink-50 transition-colors">
                  تسوق الآن
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-gradient-to-r from-teal-700 to-teal-900 text-white">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">لماذا تختارنا؟</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">جودة عالية</h3>
              <p className="text-white/80">نستخدم أفضل الأقمشة والمواد لضمان الراحة والمتانة</p>
            </div>
            
            <div className="p-6">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">توصيل سريع</h3>
              <p className="text-white/80">نضمن وصول طلبك في أسرع وقت ممكن</p>
            </div>
            
            <div className="p-6">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">دفع آمن</h3>
              <p className="text-white/80">طرق دفع متعددة وآمنة لراحتك</p>
            </div>
          </div>
        </div>
      </section>

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

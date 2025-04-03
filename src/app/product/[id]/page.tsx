'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { FaArrowRight, FaShoppingCart, FaHeart } from 'react-icons/fa';

// Sample data for all products
const allProducts = [
  {
    id: '1',
    title: 'سكراب طبي أزرق للرجال',
    price: 25000,
    image: '/images/products/product1.jpg',
    category: 'رجالي',
    description: 'سكراب طبي مريح ومتين مصنوع من قماش عالي الجودة، مناسب للاستخدام اليومي في المستشفيات والعيادات.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#3b82f6', '#1e3a8a', '#16a34a', '#000000'],
    features: [
      'قماش مقاوم للبقع',
      'مريح للارتداء لفترات طويلة',
      'جيوب متعددة',
      'سهل الغسيل والتنظيف'
    ],
    relatedProducts: ['3', '5', '7']
  },
  {
    id: '2',
    title: 'سكراب طبي وردي للنساء',
    price: 28000,
    image: '/images/products/product2.jpg',
    category: 'نسائي',
    description: 'سكراب طبي أنيق ومريح للنساء، مصنوع من قماش ناعم يسمح بحرية الحركة أثناء العمل.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#ec4899', '#be185d', '#3b82f6', '#ffffff'],
    features: [
      'قماش ناعم ومريح',
      'تصميم أنيق وعصري',
      'جيوب متعددة',
      'سهل الغسيل والتنظيف'
    ],
    relatedProducts: ['4', '6', '8']
  },
  {
    id: '3',
    title: 'معطف طبي أبيض للرجال',
    price: 35000,
    image: '/images/products/product3.jpg',
    category: 'رجالي',
    description: 'معطف طبي كلاسيكي أبيض للرجال، مثالي للأطباء والصيادلة، مصنوع من قماش متين مقاوم للبقع.',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: ['#ffffff', '#f8fafc'],
    features: [
      'قماش مقاوم للبقع',
      'تصميم كلاسيكي أنيق',
      'جيوب متعددة',
      'أزرار متينة'
    ],
    relatedProducts: ['1', '5', '9']
  },
  {
    id: '4',
    title: 'معطف طبي أبيض للنساء',
    price: 32000,
    image: '/images/products/product4.jpg',
    category: 'نسائي',
    description: 'معطف طبي أنيق للنساء بتصميم عصري، مناسب للطبيبات والصيدلانيات، مصنوع من قماش عالي الجودة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#ffffff', '#f8fafc'],
    features: [
      'قماش مقاوم للبقع',
      'تصميم عصري أنيق',
      'جيوب متعددة',
      'خياطة متينة'
    ],
    relatedProducts: ['2', '6', '10']
  },
  {
    id: '5',
    title: 'طقم سكراب طبي أخضر للرجال',
    price: 45000,
    image: '/images/products/product5.jpg',
    category: 'رجالي',
    description: 'طقم سكراب طبي كامل للرجال يتضمن قميص وبنطلون، مصنوع من قماش مريح ومتين مناسب للاستخدام اليومي.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#16a34a', '#3b82f6', '#1e3a8a', '#000000'],
    features: [
      'طقم كامل (قميص وبنطلون)',
      'قماش مريح ومتين',
      'جيوب متعددة',
      'خصر مطاطي مريح'
    ],
    relatedProducts: ['1', '3', '11']
  },
  {
    id: '6',
    title: 'طقم سكراب طبي أزرق فاتح للنساء',
    price: 48000,
    image: '/images/products/product6.jpg',
    category: 'نسائي',
    description: 'طقم سكراب طبي كامل للنساء بتصميم أنيق، مصنوع من قماش ناعم ومريح يسمح بحرية الحركة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#93c5fd', '#ec4899', '#be185d', '#ffffff'],
    features: [
      'طقم كامل (قميص وبنطلون)',
      'قماش ناعم ومريح',
      'تصميم أنيق وعصري',
      'خصر مطاطي مريح'
    ],
    relatedProducts: ['2', '4', '12']
  },
  {
    id: '7',
    title: 'سكراب طبي أسود للرجال',
    price: 28000,
    image: '/images/products/product1.jpg',
    category: 'رجالي',
    description: 'سكراب طبي بلون أسود أنيق للرجال، مصنوع من قماش عالي الجودة مريح ومتين.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#000000', '#1e3a8a', '#3b82f6', '#16a34a'],
    features: [
      'قماش مقاوم للبقع',
      'مريح للارتداء لفترات طويلة',
      'جيوب متعددة',
      'سهل الغسيل والتنظيف'
    ],
    relatedProducts: ['1', '3', '5']
  },
  {
    id: '8',
    title: 'سكراب طبي أرجواني للنساء',
    price: 30000,
    image: '/images/products/product2.jpg',
    category: 'نسائي',
    description: 'سكراب طبي بلون أرجواني أنيق للنساء، مصنوع من قماش ناعم ومريح يسمح بحرية الحركة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#8b5cf6', '#ec4899', '#be185d', '#ffffff'],
    features: [
      'قماش ناعم ومريح',
      'تصميم أنيق وعصري',
      'جيوب متعددة',
      'سهل الغسيل والتنظيف'
    ],
    relatedProducts: ['2', '4', '6']
  },
  {
    id: '9',
    title: 'معطف طبي رمادي للرجال',
    price: 32000,
    image: '/images/products/product3.jpg',
    category: 'رجالي',
    description: 'معطف طبي بلون رمادي أنيق للرجال، مناسب للأطباء والصيادلة، مصنوع من قماش متين مقاوم للبقع.',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: ['#6b7280', '#ffffff', '#f8fafc'],
    features: [
      'قماش مقاوم للبقع',
      'تصميم كلاسيكي أنيق',
      'جيوب متعددة',
      'أزرار متينة'
    ],
    relatedProducts: ['3', '5', '11']
  },
  {
    id: '10',
    title: 'معطف طبي بيج للنساء',
    price: 34000,
    image: '/images/products/product4.jpg',
    category: 'نسائي',
    description: 'معطف طبي بلون بيج أنيق للنساء، مناسب للطبيبات والصيدلانيات، مصنوع من قماش عالي الجودة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#d6d3d1', '#ffffff', '#f8fafc'],
    features: [
      'قماش مقاوم للبقع',
      'تصميم عصري أنيق',
      'جيوب متعددة',
      'خياطة متينة'
    ],
    relatedProducts: ['4', '6', '12']
  },
  {
    id: '11',
    title: 'طقم سكراب طبي أزرق داكن للرجال',
    price: 48000,
    image: '/images/products/product5.jpg',
    category: 'رجالي',
    description: 'طقم سكراب طبي كامل للرجال بلون أزرق داكن، يتضمن قميص وبنطلون، مصنوع من قماش مريح ومتين.',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['#1e3a8a', '#3b82f6', '#16a34a', '#000000'],
    features: [
      'طقم كامل (قميص وبنطلون)',
      'قماش مريح ومتين',
      'جيوب متعددة',
      'خصر مطاطي مريح'
    ],
    relatedProducts: ['5', '7', '9']
  },
  {
    id: '12',
    title: 'طقم سكراب طبي تركواز للنساء',
    price: 50000,
    image: '/images/products/product6.jpg',
    category: 'نسائي',
    description: 'طقم سكراب طبي كامل للنساء بلون تركواز جذاب، مصنوع من قماش ناعم ومريح يسمح بحرية الحركة.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    colors: ['#06b6d4', '#ec4899', '#be185d', '#ffffff'],
    features: [
      'طقم كامل (قميص وبنطلون)',
      'قماش ناعم ومريح',
      'تصميم أنيق وعصري',
      'خصر مطاطي مريح'
    ],
    relatedProducts: ['6', '8', '10']
  }
];

export default function ProductPage() {
  const params = useParams();
  const productId = params.id as string;
  
  const [product, setProduct] = useState<any>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    // Find the product by ID
    const foundProduct = allProducts.find(p => p.id === productId);
    if (foundProduct) {
      setProduct(foundProduct);
      setSelectedSize(foundProduct.sizes[0]);
      setSelectedColor(foundProduct.colors[0]);
      
      // Get related products
      const related = foundProduct.relatedProducts
        .map(id => allProducts.find(p => p.id === id))
        .filter(Boolean);
      setRelatedProducts(related as any[]);
    }
  }, [productId]);

  const handleAddToCart = () => {
    // Logic to add product to cart would go here
    console.log('Added to cart:', {
      ...product,
      selectedSize,
      selectedColor,
      quantity
    });
    // Redirect to cart or show confirmation
  };

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-gray-600">جاري تحميل المنتج...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-20 px-4">
      <div className="container mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center text-sm text-gray-500 mb-8 flex-row-reverse">
          <Link href="/" className="hover:text-teal-600">الرئيسية</Link>
          <span className="mx-2">/</span>
          <Link 
            href={product.category === 'رجالي' ? '/men' : '/women'} 
            className="hover:text-teal-600"
          >
            {product.category === 'رجالي' ? 'ملابس الرجال' : 'ملابس النساء'}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">{product.title}</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Product Image */}
          <div className="relative h-96 md:h-[600px] rounded-lg overflow-hidden">
            <Image
              src={product.image}
              alt={product.title}
              fill
              style={{ objectFit: 'cover' }}
              className="rounded-lg"
            />
          </div>
          
          {/* Product Details */}
          <div className="text-right">
            <h1 className="text-3xl font-bold mb-2">{product.title}</h1>
            <p className="text-2xl font-bold text-teal-700 mb-6">{product.price} د.ع</p>
            
            <div className="mb-6">
              <p className="text-gray-700 leading-relaxed">{product.description}</p>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">المميزات:</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {product.features.map((feature: string, index: number) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">المقاس:</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                {product.sizes.map((size: string) => (
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
            
            <div className="mb-6">
              <h3 className="font-semibold mb-2">اللون:</h3>
              <div className="flex flex-wrap gap-3 justify-end">
                {product.colors.map((color: string) => (
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
            
            <div className="mb-8">
              <h3 className="font-semibold mb-2">الكمية:</h3>
              <div className="flex items-center justify-end">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 border border-gray-300 rounded-md flex items-center justify-center"
                >
                  -
                </button>
                <span className="w-16 text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 border border-gray-300 rounded-md flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="flex gap-4 flex-row-reverse">
              <button 
                onClick={handleAddToCart}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-6 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <FaShoppingCart />
                <span>إضافة إلى السلة</span>
              </button>
              <button 
                onClick={() => setIsFavorite(!isFavorite)}
                className={`w-12 h-12 flex items-center justify-center rounded-md border ${
                  isFavorite 
                    ? 'bg-red-500 text-white border-red-500' 
                    : 'bg-white text-gray-700 border-gray-300 hover:border-red-500'
                }`}
              >
                <FaHeart />
              </button>
            </div>
          </div>
        </div>
        
        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-8 text-right">منتجات ذات صلة</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {relatedProducts.map((relatedProduct) => (
                <Link href={`/product/${relatedProduct.id}`} key={relatedProduct.id}>
                  <div className="bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300 hover:shadow-xl">
                    <div className="relative h-64 w-full">
                      <Image
                        src={relatedProduct.image}
                        alt={relatedProduct.title}
                        fill
                        style={{ objectFit: 'cover' }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white text-right">
                        <span className="inline-block bg-teal-600 text-white text-sm px-3 py-1 rounded-full">
                          {relatedProduct.category}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4 text-right">
                      <h3 className="text-lg font-semibold mb-2">{relatedProduct.title}</h3>
                      <p className="text-lg font-bold text-teal-700">{relatedProduct.price} د.ع</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

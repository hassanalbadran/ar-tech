'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';

interface ImageSliderProps {
  images: {
    src: string;
    alt: string;
  }[];
}

const ImageSlider = ({ images }: ImageSliderProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 3000,
    pauseOnHover: true,
    arrows: true,
    responsive: [
      {
        breakpoint: 768,
        settings: {
          arrows: false,
        }
      }
    ]
  };

  if (!mounted) return null;

  return (
    <div className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
      <Slider {...settings}>
        {images.map((image, index) => (
          <div key={index} className="relative w-full h-[500px] md:h-[600px]">
            <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent z-10"></div>
            <Image
              src={image.src}
              alt={image.alt}
              fill
              style={{ objectFit: 'cover' }}
              priority={index === 0}
              className="transition-transform duration-500 hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-end z-20 p-10 md:p-20">
              <div className="text-white text-right max-w-md">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">ملابس طبية عصرية</h2>
                <p className="text-lg md:text-xl mb-6">تصاميم مريحة وعملية للعاملين في المجال الطبي</p>
                <button className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-6 rounded-full transition-colors">
                  تسوق الآن
                </button>
              </div>
            </div>
          </div>
        ))}
      </Slider>
    </div>
  );
};

export default ImageSlider;

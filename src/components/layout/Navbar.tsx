'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaShoppingCart, FaUser, FaBars } from 'react-icons/fa';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
      isScrolled ? 'bg-white/90 shadow-md' : 'bg-transparent'
    }`}>
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-teal-600">
            الملابس الطبية
          </Link>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-teal-600 focus:outline-none"
            >
              <FaBars size={24} />
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6 text-gray-700">
            <Link href="/" className="hover:text-teal-600 transition-colors">
              الرئيسية
            </Link>
            <Link href="/men" className="hover:text-teal-600 transition-colors">
              ملابس الذكور
            </Link>
            <Link href="/women" className="hover:text-teal-600 transition-colors">
              ملابس الإناث
            </Link>
            <Link href="/auth" className="hover:text-teal-600 transition-colors">
              <FaUser size={20} />
            </Link>
            <Link href="/cart" className="hover:text-teal-600 transition-colors">
              <FaShoppingCart size={20} />
            </Link>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`md:hidden ${isMenuOpen ? 'block' : 'hidden'} mt-4 bg-white/95 rounded-lg shadow-lg p-4 transition-all duration-300`}>
          <div className="flex flex-col space-y-3 text-right">
            <Link 
              href="/" 
              className="block py-2 px-4 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              الرئيسية
            </Link>
            <Link 
              href="/men" 
              className="block py-2 px-4 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              ملابس الذكور
            </Link>
            <Link 
              href="/women" 
              className="block py-2 px-4 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              ملابس الإناث
            </Link>
            <Link 
              href="/auth" 
              className="block py-2 px-4 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              تسجيل الدخول
            </Link>
            <Link 
              href="/cart" 
              className="block py-2 px-4 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              سلة التسوق
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

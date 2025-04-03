'use client';

import Link from 'next/link';
import { FaFacebook, FaTwitter, FaInstagram, FaEnvelope, FaPhone, FaMapMarkerAlt } from 'react-icons/fa';

const Footer = () => {
  return (
    <footer className="bg-gradient-to-r from-teal-700 to-teal-900 text-white">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-right">
          <div>
            <h3 className="text-xl font-bold mb-4">الملابس الطبية</h3>
            <p className="mb-4">متجرك المتخصص لجميع أنواع الملابس الطبية للعاملين في المجال الطبي بتصاميم عصرية وجودة عالية.</p>
            <div className="flex space-x-4 justify-end">
              <a href="#" className="hover:text-teal-300 transition-colors">
                <FaInstagram size={20} />
              </a>
              <a href="#" className="hover:text-teal-300 transition-colors">
                <FaTwitter size={20} />
              </a>
              <a href="#" className="hover:text-teal-300 transition-colors">
                <FaFacebook size={20} />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">روابط سريعة</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="hover:text-teal-300 transition-colors">الرئيسية</Link>
              </li>
              <li>
                <Link href="/men" className="hover:text-teal-300 transition-colors">ملابس الذكور</Link>
              </li>
              <li>
                <Link href="/women" className="hover:text-teal-300 transition-colors">ملابس الإناث</Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-teal-300 transition-colors">سلة التسوق</Link>
              </li>
              <li>
                <Link href="/auth" className="hover:text-teal-300 transition-colors">تسجيل الدخول</Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-xl font-bold mb-4">تواصل معنا</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <span className="mr-2">info@medical-scrubs.com</span>
                <FaEnvelope className="text-teal-300" />
              </div>
              <div className="flex items-center justify-end">
                <span className="mr-2">+964 123 456 789</span>
                <FaPhone className="text-teal-300" />
              </div>
              <div className="flex items-center justify-end">
                <span className="mr-2">بغداد، العراق</span>
                <FaMapMarkerAlt className="text-teal-300" />
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-teal-600 mt-8 pt-6 text-center">
          <p>&copy; {new Date().getFullYear()} الملابس الطبية. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

import React, { useState } from 'react';
import {
  Plus,
  Search,
  Camera,
  Edit2,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Barcode,
  Package,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { formatAZN } from '../utils/dateUtils';
import { calculateProductStock } from '../utils/stockCalculations';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { exportProductsToCSV, parseProductsCSV } from '../utils/exportUtils';

export const ProductsView: React.FC = () => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    purchases,
    sales,
    settings,
    currentUser,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [category, setCategory] = useState('Su');
  const [volume, setVolume] = useState('');
  const [initialStock, setInitialStock] = useState('50');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [note, setNote] = useState('');
  const [image, setImage] = useState('');

  // Extract unique categories
  const categories = Array.from(new Set(products.map(p => p.category || 'Ümumi')));

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setName('');
    setBarcode('');
    setSalePrice('');
    setBuyPrice('');
    setCategory('Su');
    setVolume('');
    setInitialStock('50');
    setMinStockAlert(String(settings.minStockThreshold || 5));
    setNote('');
    setImage('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setBarcode(p.barcode);
    setSalePrice(String(p.salePrice));
    setBuyPrice(String(p.buyPrice));
    setCategory(p.category);
    setVolume(p.volume || '');
    setInitialStock(String(p.initialStock));
    setMinStockAlert(String(p.minStockAlert));
    setNote(p.note || '');
    setImage(p.image || '');
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const sPrice = parseFloat(salePrice) || 0;
    const bPrice = parseFloat(buyPrice) || 0;
    const iStock = parseInt(initialStock, 10) || 0;
    const mStock = parseInt(minStockAlert, 10) || settings.minStockThreshold || 5;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: name.trim(),
        barcode: barcode.trim(),
        salePrice: sPrice,
        buyPrice: bPrice,
        category,
        volume: volume.trim(),
        initialStock: iStock,
        minStockAlert: mStock,
        note: note.trim(),
        image: image || undefined,
      });
    } else {
      addProduct({
        name: name.trim(),
        barcode: barcode.trim() || `476${Math.floor(10000 + Math.random() * 90000)}`,
        salePrice: sPrice,
        buyPrice: bPrice,
        category,
        volume: volume.trim(),
        initialStock: iStock,
        minStockAlert: mStock,
        note: note.trim(),
        image: image || undefined,
      });
    }

    setIsModalOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const text = event.target?.result as string;
        if (text) {
          const parsed = parseProductsCSV(text);
          parsed.forEach(p => {
            if (p.name) {
              addProduct({
                name: p.name,
                barcode: p.barcode || `476${Math.floor(10000 + Math.random() * 90000)}`,
                salePrice: p.salePrice || 1.0,
                buyPrice: p.buyPrice || 0.5,
                category: p.category || 'Ümumi',
                volume: p.volume || '',
                initialStock: p.initialStock || 50,
                minStockAlert: p.minStockAlert || 5,
                note: p.note || '',
              });
            }
          });
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Məhsullar və Depo Qalığı</span>
            <span className="text-xs bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800">
              {products.length} məhsul
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Zal barındakı içki və məhsulların qiyməti, barkodu və aktiv sayı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportProductsToCSV(products)}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          {isAdmin && (
            <label className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              <span>CSV İdxal</span>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
          )}

          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Məhsul</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Məhsul adı və ya barkod ilə axtar..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-red-600 text-white font-bold shadow-sm'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
            }`}
          >
            Hamısı ({products.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-red-600 text-white font-bold shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center bg-zinc-900 rounded-2xl border border-zinc-800 space-y-3">
          <Package className="w-10 h-10 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-400">
            Axtarışa uyğun məhsul tapılmadı.
          </p>
          {isAdmin && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-bold bg-red-600 text-white rounded-xl shadow-md"
            >
              Yeni Məhsul Əlavə Et
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => {
            const stock = calculateProductStock(product, purchases, sales, settings.minStockThreshold);
            return (
              <div
                key={product.id}
                className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md hover:border-zinc-700 transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Image Slot or Placeholder */}
                  <div className="relative aspect-[16/10] bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-800">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-500">
                        <Package className="w-8 h-8 text-red-500/80" />
                        <span className="text-[10px] mt-1 font-medium">{product.category}</span>
                      </div>
                    )}

                    {/* Low stock badge overlay */}
                    {stock.isLowStock && (
                      <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Kritik ({stock.activeStock})</span>
                      </div>
                    )}

                    {product.volume && (
                      <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                        {product.volume}
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-sm font-bold text-white leading-snug">
                        {product.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                      <Barcode className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{product.barcode}</span>
                    </div>

                    {/* Stock & Prices */}
                    <div className="pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block uppercase">Satış Qiyməti</span>
                        <span className="font-mono font-bold text-red-400 text-sm">
                          {formatAZN(product.salePrice)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block uppercase">Aktiv Qalıq</span>
                        <span className={`font-mono font-bold text-sm ${
                          stock.isLowStock ? 'text-red-500 font-extrabold' : 'text-white'
                        }`}>
                          {stock.activeStock} ədəd
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="text-[11px] text-zinc-500 pt-1 flex justify-between">
                        <span>Alış: {formatAZN(product.buyPrice)}</span>
                        <span>İlkin: {product.initialStock} əd.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                {isAdmin && (
                  <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between">
                    <button
                      onClick={() => openEditModal(product)}
                      className="px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Redaktə</span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`"${product.name}" məhsulunu silmək istədiyinizə əminsiniz?`)) {
                          deleteProduct(product.id);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Sil</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h3 className="text-base font-bold text-white">
                {editingProduct ? 'Məhsulu Redaktə Et' : 'Yeni Məhsul Əlavə Et'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Məhsulun Adı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="məs: 0,5 L Su və ya Protein Şeyk"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {/* Barcode with Camera Scan button */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Barkod
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Barkodu yazın və ya oxudun..."
                    className="flex-1 px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Oxut</span>
                  </button>
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Satış Qiyməti (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    required
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    placeholder="0.50"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Alış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={buyPrice}
                    onChange={e => setBuyPrice(e.target.value)}
                    placeholder="0.25"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Category & Volume */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Kateqoriya
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Su">Su</option>
                    <option value="Protein">Protein</option>
                    <option value="Enerji və BCAA">Enerji və BCAA</option>
                    <option value="Qəlyanaltı">Qəlyanaltı</option>
                    <option value="Əlavələr">Əlavələr</option>
                    <option value="Digər">Digər</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Həcm / Qramaj
                  </label>
                  <input
                    type="text"
                    value={volume}
                    onChange={e => setVolume(e.target.value)}
                    placeholder="məs: 0.5 L, 60g"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Initial stock and alert threshold */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    İlkin Depo Qalığı
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={e => setInitialStock(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Minimum Hədd (Xəbərdarlıq)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minStockAlert}
                    onChange={e => setMinStockAlert(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Şəkil (Qalereya və ya Kamera)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Əlavə qeydlər..."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-600/30"
                >
                  Yadda Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={code => {
          setBarcode(code);
        }}
        title="Məhsul Barkodunu Oxut"
      />
    </div>
  );
};
